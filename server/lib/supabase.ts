import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** 환경변수가 없으면 null — retrieve 단계는 로컬 목데이터로 폴백 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;
