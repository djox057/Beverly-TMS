import { expect,it } from "vitest";
import { isPretripVideo } from "./pretripMedia";
it("uses stored MIME types and filename fallback for older media",()=>{
 expect(isPretripVideo({content_type:"video/quicktime",file_name:"front"})).toBe(true);
 expect(isPretripVideo({file_name:"front.MP4"})).toBe(true);
 expect(isPretripVideo({content_type:"image/jpeg",file_name:"front.mov"})).toBe(false);
 expect(isPretripVideo({file_name:"front.jpg"})).toBe(false);
});
