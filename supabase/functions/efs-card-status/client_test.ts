import { assertEquals, assertStringIncludes, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getCardV2,
  setCardV2,
  getCardSummariesV2,
  withCardLock,
  resetSessionsForTests,
  type CarrierAccount,
} from "../_shared/efs/client.ts";
import { buildSetCardPayload, maskForLog } from "../_shared/efs/cardStatus.ts";

const account: CarrierAccount = {
  id: "acct-1",
  name: "QA CARRIER",
  credential_secret_name: "EFS_CREDENTIALS_QA_CARRIER",
  environment: "qa",
};

Deno.env.set("EFS_SOAP_ENDPOINT_QA", "https://efs.example.test/ws");
Deno.env.set("EFS_CREDENTIALS_QA_CARRIER", JSON.stringify({ username: "u", password: "hunter2" }));

const soap = (inner: string) =>
  `<?xml version="1.0"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>${inner}</soapenv:Body></soapenv:Envelope>`;

const loginXml = soap(`<ns:loginResponse xmlns:ns="http://ws.efsllc.com/"><ns:return>CID-1</ns:return></ns:loginResponse>`);

const cardXml = (status: string) =>
  soap(
    `<ns:getCardv2Response xmlns:ns="http://ws.efsllc.com/"><ns:return>` +
      `<ns:cardNumber>7083350000012341234</ns:cardNumber><ns:status>${status}</ns:status>` +
      `<ns:unit>1042</ns:unit><ns:limits><ns:product>DSL</ns:product><ns:limit>150</ns:limit></ns:limits>` +
      `</ns:return></ns:getCardv2Response>`,
  );

const faultXml = (code: string, message: string) =>
  soap(`<soap:Fault xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><faultcode>${code}</faultcode><faultstring>${message}</faultstring></soap:Fault>`);

interface Recorded {
  action: string;
  body: string;
}

function mockFetch(responder: (action: string, body: string, callIndex: number) => string, log: Recorded[] = []) {
  let i = 0;
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    const action = String((init.headers as Record<string, string>).SOAPAction).split("/").pop() ?? "";
    const body = String(init.body);
    log.push({ action, body });
    const xml = responder(action, body, i++);
    return Promise.resolve(new Response(xml, { status: 200, headers: { "Content-Type": "text/xml" } }));
  }) as typeof fetch;
  return log;
}

Deno.test("logs in once and reads an Active card", async () => {
  resetSessionsForTests();
  const log = mockFetch((action) => (action === "login" ? loginXml : cardXml("Active")));
  const card = await getCardV2(account, "7083350000012341234");
  assertEquals(card.status, "Active");
  assertEquals(log.map((l) => l.action), ["login", "getCardv2"]);
});

Deno.test("reads a Hold card and reuses the cached session", async () => {
  resetSessionsForTests();
  const log = mockFetch((action) => (action === "login" ? loginXml : cardXml("Hold")));
  await getCardV2(account, "7083350000012341234");
  await getCardV2(account, "7083350000012341234");
  assertEquals(log.filter((l) => l.action === "login").length, 1);
});

Deno.test("reads an uncontrollable card status verbatim", async () => {
  resetSessionsForTests();
  mockFetch((action) => (action === "login" ? loginXml : cardXml("Deleted")));
  const card = await getCardV2(account, "7083350000012341234");
  assertEquals(card.status, "Deleted");
  let threw = "";
  try {
    buildSetCardPayload(card, "Hold");
  } catch (e) {
    threw = (e as Error).message;
  }
  assertStringIncludes(threw, "cannot be controlled from TMS");
});

Deno.test("session expiry triggers exactly one relogin and then succeeds", async () => {
  resetSessionsForTests();
  const log = mockFetch((action, _body, i) => {
    if (action === "login") return loginXml;
    if (i === 1) return faultXml("soap:Server", "InvalidClientId: session expired");
    return cardXml("Active");
  });
  const card = await getCardV2(account, "7083350000012341234");
  assertEquals(card.status, "Active");
  assertEquals(log.filter((l) => l.action === "login").length, 2);
});

Deno.test("business SOAP faults are surfaced and not retried", async () => {
  resetSessionsForTests();
  const log = mockFetch((action) => (action === "login" ? loginXml : faultXml("soap:Client", "Card not found")));
  let message = "";
  try {
    await getCardV2(account, "7083350000012341234");
  } catch (e) {
    message = (e as Error).message;
  }
  assertStringIncludes(message, "Card not found");
  assertEquals(log.filter((l) => l.action === "getCardv2").length, 1);
});

Deno.test("setCardV2 sends the complete card payload with only status changed", async () => {
  resetSessionsForTests();
  const log = mockFetch((action) => {
    if (action === "login") return loginXml;
    if (action === "getCardv2") return cardXml("Active");
    return soap(`<ns:setCardV2Response xmlns:ns="http://ws.efsllc.com/"><ns:return>OK</ns:return></ns:setCardV2Response>`);
  });
  const current = await getCardV2(account, "7083350000012341234");
  await setCardV2(account, buildSetCardPayload(current, "Hold"));
  const sent = log.find((l) => l.action === "setCardV2")!.body;
  assertStringIncludes(sent, "<status>Hold</status>");
  assertStringIncludes(sent, "<unit>1042</unit>");
  assertStringIncludes(sent, "<product>DSL</product>");
  assertStringIncludes(sent, "<limit>150</limit>");
});

Deno.test("bulk sync makes one summaries request per carrier", async () => {
  resetSessionsForTests();
  const log = mockFetch((action) => {
    if (action === "login") return loginXml;
    return soap(
      `<ns:getCardSummariesV2Response xmlns:ns="http://ws.efsllc.com/">` +
        `<ns:return><ns:cardNumber>7083350000012341234</ns:cardNumber><ns:status>Hold</ns:status><ns:unit>1042</ns:unit></ns:return>` +
        `<ns:return><ns:cardNumber>7083350000099995555</ns:cardNumber><ns:status>Active</ns:status><ns:unit>1043</ns:unit></ns:return>` +
        `</ns:getCardSummariesV2Response>`,
    );
  });
  const summaries = await getCardSummariesV2(account);
  assertEquals(summaries.length, 2);
  assertEquals(summaries[0].status, "Hold");
  assertEquals(log.filter((l) => l.action === "getCardSummariesV2").length, 1);
  assertEquals(log.filter((l) => l.action === "getCardv2").length, 0);
});

Deno.test("concurrent changes on one card are serialized", async () => {
  resetSessionsForTests();
  const order: string[] = [];
  const first = withCardLock("acct-1:card", async () => {
    order.push("start-1");
    await new Promise((r) => setTimeout(r, 25));
    order.push("end-1");
  });
  const second = withCardLock("acct-1:card", async () => {
    order.push("start-2");
    order.push("end-2");
  });
  await Promise.all([first, second]);
  assertEquals(order, ["start-1", "end-1", "start-2", "end-2"]);
});

Deno.test("credentials and card numbers never appear unmasked in logs", () => {
  const line = maskForLog("<password>hunter2</password> 7083350000012341234 <clientId>CID-1</clientId>");
  assert(!line.includes("hunter2"));
  assert(!line.includes("7083350000012341234"));
  assert(!line.includes("CID-1"));
});
