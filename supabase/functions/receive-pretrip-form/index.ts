import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { receivePretripForm } from "./receiver.ts";

Deno.serve(req => receivePretripForm(req, () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
));
