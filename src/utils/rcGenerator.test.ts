import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateRc, type RcOrder } from "./rcGenerator";

function makeOrder(numPu: number, numDel: number): RcOrder {
  return {
    load: {
      load_number: "L-123",
      driver: "John Doe",
      commodity: "Freight",
      truck: "T-1",
      weight: "42000",
      trailer: "TR-9",
      miles: "500",
      phone: "555-1234",
      rate: "$1,500",
    },
    pickups: Array.from({ length: numPu }, (_, i) => ({
      shipper: `Shipper ${i + 1}`,
      address: "1 Main St",
      csz: "Chicago, IL 60601",
      date: "01/01/2026",
      time: "08:00",
      num: `PU-${i + 1}`,
    })),
    deliveries: Array.from({ length: numDel }, (_, i) => ({
      receiver: `Receiver ${i + 1}`,
      address: "2 Oak Ave",
      csz: "Dallas, TX 75201",
      date: "01/03/2026",
      time: "12:00",
      num: `DL-${i + 1}`,
    })),
  };
}

async function getFieldNames(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getForm().getFields().map((f) => f.getName());
}

describe("rcGenerator", () => {
  it("creates expected field names for N=1", async () => {
    const bytes = await generateRc(makeOrder(1, 1));
    const names = await getFieldNames(bytes);
    expect(names).toContain("load_number");
    expect(names).toContain("pu1_shipper");
    expect(names).toContain("del1_receiver");
    expect(names).not.toContain("pu2_shipper");
  });

  it("creates indexed field names for N=2 and N=3", async () => {
    const bytes2 = await generateRc(makeOrder(2, 2));
    const names2 = await getFieldNames(bytes2);
    expect(names2).toContain("pu2_shipper");
    expect(names2).toContain("del2_receiver");

    const bytes3 = await generateRc(makeOrder(3, 3));
    const names3 = await getFieldNames(bytes3);
    expect(names3).toContain("pu3_shipper");
    expect(names3).toContain("del3_receiver");
  });

  it("does not include PO# or signature fields", async () => {
    const bytes = await generateRc(makeOrder(2, 2));
    const names = await getFieldNames(bytes);
    for (const n of names) {
      expect(n.toLowerCase()).not.toMatch(/po[_#]|signature|signed/);
    }
  });

  it("paginates with many stops", async () => {
    const bytes = await generateRc(makeOrder(6, 6));
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("prefills field values and keeps fields unflattened", async () => {
    const bytes = await generateRc(makeOrder(1, 1));
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    expect(form.getTextField("load_number").getText()).toBe("L-123");
    expect(form.getTextField("pu1_shipper").getText()).toBe("Shipper 1");
    // Unflattened: fields remain present and editable
    expect(form.getFields().length).toBeGreaterThan(0);
  });
});