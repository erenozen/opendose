// Example tumour-growth study in long format: tumour volume (mm³, L×W²/2)
// of 24 mice in three arms measured twice a week. Synthetic (exponential
// growth with a per-mouse rate and log-normal noise; seeded, fixed);
// mice are removed once their tumour passes 1500 mm³, so the vehicle
// arm loses its last measurements, as in a real study.
import { normalizeTable } from "../../project/table.ts";
import type { DataTableModel } from "../../project/types.ts";

// mouse,group,day,volume; records separated by ";"
const RECORDS = `
  M01,Vehicle,0,75.0; M01,Vehicle,3,143.9; M01,Vehicle,7,207.7; M01,Vehicle,10,362.0;
  M01,Vehicle,14,607.5; M01,Vehicle,17,968.6; M01,Vehicle,21,1836.4; M02,Vehicle,0,85.2;
  M02,Vehicle,3,152.7; M02,Vehicle,7,293.5; M02,Vehicle,10,419.4; M02,Vehicle,14,802.7;
  M02,Vehicle,17,1112.8; M02,Vehicle,21,1737.8; M03,Vehicle,0,71.0; M03,Vehicle,3,116.4;
  M03,Vehicle,7,193.6; M03,Vehicle,10,339.6; M03,Vehicle,14,579.6; M03,Vehicle,17,919.1;
  M03,Vehicle,21,1615.5; M04,Vehicle,0,106.6; M04,Vehicle,3,146.5; M04,Vehicle,7,291.0;
  M04,Vehicle,10,483.1; M04,Vehicle,14,872.1; M04,Vehicle,17,1382.9; M04,Vehicle,21,2482.3;
  M05,Vehicle,0,139.6; M05,Vehicle,3,261.3; M05,Vehicle,7,506.0; M05,Vehicle,10,840.9;
  M05,Vehicle,14,1875.1; M06,Vehicle,0,115.6; M06,Vehicle,3,194.3; M06,Vehicle,7,394.1;
  M06,Vehicle,10,658.4; M06,Vehicle,14,1289.8; M06,Vehicle,17,2246.5; M07,Vehicle,0,73.2;
  M07,Vehicle,3,115.0; M07,Vehicle,7,238.8; M07,Vehicle,10,375.1; M07,Vehicle,14,744.1;
  M07,Vehicle,17,1137.2; M07,Vehicle,21,1925.9; M08,Vehicle,0,105.7; M08,Vehicle,3,143.2;
  M08,Vehicle,7,304.9; M08,Vehicle,10,452.8; M08,Vehicle,14,737.2; M08,Vehicle,17,1358.5;
  M08,Vehicle,21,2090.4; M09,Drug A,0,96.2; M09,Drug A,3,141.5; M09,Drug A,7,232.2;
  M09,Drug A,10,254.6; M09,Drug A,14,466.9; M09,Drug A,17,668.5; M09,Drug A,21,908.0;
  M09,Drug A,24,1307.7; M10,Drug A,0,99.3; M10,Drug A,3,122.3; M10,Drug A,7,192.3;
  M10,Drug A,10,315.3; M10,Drug A,14,472.1; M10,Drug A,17,641.5; M10,Drug A,21,1051.4;
  M10,Drug A,24,1767.6; M11,Drug A,0,114.0; M11,Drug A,3,158.2; M11,Drug A,7,208.6;
  M11,Drug A,10,217.6; M11,Drug A,14,354.4; M11,Drug A,17,453.1; M11,Drug A,21,702.5;
  M11,Drug A,24,880.2; M12,Drug A,0,117.5; M12,Drug A,3,162.1; M12,Drug A,7,216.5;
  M12,Drug A,10,228.4; M12,Drug A,14,330.3; M12,Drug A,17,444.0; M12,Drug A,21,536.5;
  M12,Drug A,24,744.8; M13,Drug A,0,94.1; M13,Drug A,3,120.2; M13,Drug A,7,170.5;
  M13,Drug A,10,189.0; M13,Drug A,14,296.9; M13,Drug A,17,363.1; M13,Drug A,21,471.7;
  M13,Drug A,24,699.7; M14,Drug A,0,102.7; M14,Drug A,3,137.7; M14,Drug A,7,193.6;
  M14,Drug A,10,257.7; M14,Drug A,14,396.7; M14,Drug A,17,520.4; M14,Drug A,21,824.4;
  M14,Drug A,24,1079.5; M15,Drug A,0,103.8; M15,Drug A,3,128.9; M15,Drug A,7,198.6;
  M15,Drug A,10,233.2; M15,Drug A,14,406.4; M15,Drug A,17,454.5; M15,Drug A,21,630.0;
  M15,Drug A,24,815.0; M16,Drug A,0,109.8; M16,Drug A,3,137.7; M16,Drug A,7,209.8;
  M16,Drug A,10,286.3; M16,Drug A,14,407.4; M16,Drug A,17,536.1; M16,Drug A,21,963.3;
  M16,Drug A,24,1119.1; M17,Drug B,0,80.0; M17,Drug B,3,109.6; M17,Drug B,7,138.8;
  M17,Drug B,10,133.9; M17,Drug B,14,172.9; M17,Drug B,17,186.6; M17,Drug B,21,269.0;
  M17,Drug B,24,298.1; M18,Drug B,0,102.2; M18,Drug B,3,117.6; M18,Drug B,7,145.5;
  M18,Drug B,10,159.8; M18,Drug B,14,244.7; M18,Drug B,17,244.1; M18,Drug B,21,346.9;
  M18,Drug B,24,352.7; M19,Drug B,0,102.5; M19,Drug B,3,138.4; M19,Drug B,7,156.5;
  M19,Drug B,10,223.3; M19,Drug B,14,232.4; M19,Drug B,17,313.8; M19,Drug B,21,448.4;
  M19,Drug B,24,461.8; M20,Drug B,0,116.2; M20,Drug B,3,113.1; M20,Drug B,7,163.3;
  M20,Drug B,10,162.8; M20,Drug B,14,224.3; M20,Drug B,17,237.4; M20,Drug B,21,305.4;
  M20,Drug B,24,370.2; M21,Drug B,0,99.5; M21,Drug B,3,103.8; M21,Drug B,7,108.9;
  M21,Drug B,10,120.9; M21,Drug B,14,143.4; M21,Drug B,17,140.7; M21,Drug B,21,159.6;
  M21,Drug B,24,143.4; M22,Drug B,0,100.1; M22,Drug B,3,122.7; M22,Drug B,7,148.1;
  M22,Drug B,10,193.2; M22,Drug B,14,206.3; M22,Drug B,17,287.2; M22,Drug B,21,349.5;
  M22,Drug B,24,427.7; M23,Drug B,0,90.9; M23,Drug B,3,130.2; M23,Drug B,7,186.5;
  M23,Drug B,10,229.8; M23,Drug B,14,317.9; M23,Drug B,17,457.0; M23,Drug B,21,710.5;
  M23,Drug B,24,898.5; M24,Drug B,0,137.3; M24,Drug B,3,172.1; M24,Drug B,7,187.9;
  M24,Drug B,10,243.1; M24,Drug B,14,331.7; M24,Drug B,17,379.5; M24,Drug B,21,602.9;
  M24,Drug B,24,601.5;
`;

export function tumourRecordsSample(): string[][] {
  return RECORDS.split(";").map((r) => r.trim()).filter(Boolean).map((r) => r.split(","));
}

export function tumourSample(): DataTableModel {
  const recs = tumourRecordsSample();
  const col = (j: number) => recs.map((r) => [r[j]]);
  return normalizeTable({
    type: "multivariable",
    rowTitles: recs.map(() => ""),
    datasets: [
      { name: "Mouse", varType: "categorical", rows: col(0) },
      { name: "Group", varType: "categorical", rows: col(1) },
      { name: "Day", varType: "continuous", rows: col(2) },
      { name: "Volume", varType: "continuous", rows: col(3) },
    ],
  });
}
