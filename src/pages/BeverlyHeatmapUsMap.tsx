import { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { geoCentroid } from "d3-geo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MapPin } from "lucide-react";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

// FIPS state IDs to exclude: Alaska (02), Hawaii (15), and territories.
const EXCLUDED_STATE_IDS = new Set(["02", "15", "60", "66", "69", "72", "78"]);

// FIPS -> USPS abbreviation
const STATE_ABBR: Record<string, string> = {
  "01": "AL", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
  "10": "DE", "11": "DC", "12": "FL", "13": "GA", "16": "ID", "17": "IL",
  "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
  "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO",
  "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM",
  "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR",
  "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX",
  "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
  "56": "WY",
};

type Direction = "inbound" | "outbound";

export default function BeverlyHeatmapUsMap() {
  const [direction, setDirection] = useState<Direction>("inbound");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            US Map
          </CardTitle>
          <ToggleGroup
            type="single"
            value={direction}
            onValueChange={(v) => v && setDirection(v as Direction)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="inbound">Inbound</ToggleGroupItem>
            <ToggleGroupItem value="outbound">Outbound</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full">
          <ComposableMap
            projection="geoAlbersUsa"
            projectionConfig={{ scale: 1000 }}
            width={975}
            height={610}
            style={{ width: "100%", height: "auto" }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies
                  .filter((geo) => !EXCLUDED_STATE_IDS.has(String(geo.id)))
                  .map((geo) => {
                    const abbr = STATE_ABBR[String(geo.id)] || "";
                    const centroid = geoCentroid(geo);
                    return (
                      <g key={geo.rsmKey}>
                        <Geography
                          geography={geo}
                          style={{
                            default: {
                              fill: "hsl(var(--muted))",
                              stroke: "hsl(var(--border))",
                              strokeWidth: 0.75,
                              outline: "none",
                            },
                            hover: {
                              fill: "hsl(var(--accent))",
                              stroke: "hsl(var(--border))",
                              strokeWidth: 0.75,
                              outline: "none",
                              cursor: "pointer",
                            },
                            pressed: {
                              fill: "hsl(var(--primary))",
                              outline: "none",
                            },
                          }}
                        />
                        {abbr && (
                          <text
                            x={0}
                            y={0}
                            transform={`translate(${centroid[0]}, ${centroid[1]})`}
                            textAnchor="middle"
                            style={{
                              fontFamily: "inherit",
                              fontSize: 10,
                              fontWeight: 600,
                              fill: "hsl(var(--foreground))",
                              pointerEvents: "none",
                            }}
                          >
                            {abbr}
                          </text>
                        )}
                      </g>
                    );
                  })
              }
            </Geographies>
          </ComposableMap>
        </div>
      </CardContent>
    </Card>
  );
}
