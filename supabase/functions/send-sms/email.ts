// A fixed random marker lets every mileage alert match one email filter.
export const MILES_CHANGE_FILTER_CODE = "BFTMSMC7F3A91C2";
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export function buildMilesChangeEmail(message: string) {
  const lines = message.split("\n");
  const heading = lines.shift() || "Miles changed";
  return {
    subject: heading.replace(/[\r\n]/g, " ").slice(0, 200),
    headers: { "X-Beverly-Alert-Code": MILES_CHANGE_FILTER_CODE, "List-Id": `<${MILES_CHANGE_FILTER_CODE}.beverlytms.com>` },
    html: `<div style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;font-size:0;line-height:0" aria-hidden="true">${MILES_CHANGE_FILTER_CODE}</div>
    <div style="background:#f1f5f9;padding:24px;font-family:Arial,sans-serif;color:#0f172a">
      <div style="max-width:600px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <div style="background:#172554;color:white;padding:20px;font-size:20px;font-weight:bold">Mileage change alert</div>
        <div style="padding:24px"><h2 style="font-size:17px;margin:0 0 20px">${escapeHtml(heading)}</h2>
          ${lines.map(line => `<div style="padding:7px 0;white-space:pre-wrap">${escapeHtml(line)}</div>`).join("")}
        </div>
      </div>
    </div>`,
  };
}
