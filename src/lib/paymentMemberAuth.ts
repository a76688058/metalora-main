import type { SupabaseClient } from "@supabase/supabase-js";
import { isUsableMemberProfile, USABLE_MEMBER_PROFILE_COLUMNS } from "./authIntegrity";

export type PaymentMemberUser = {
  verifiedUserId: string;
  verifiedUserCustomId: string;
};

export type PaymentMemberAuthResult =
  | { ok: true; user: PaymentMemberUser }
  | { ok: false; status: number; error: string };

const GENERIC_AUTH = "인증이 필요합니다.";
const GENERIC_PROFILE = "회원 정보를 확인할 수 없습니다.";
const GENERIC_CONFIG = "서버 구성 오류가 발생했습니다.";

/**
 * Canonical customer payment authorization.
 * Matches isUsableMemberProfile: id + username + fingerprint + phone_verified_at.
 * Contact shipping phone is not authority.
 */
export async function verifyPaymentMember(
  supabaseAdmin: SupabaseClient | null,
  supabasePublic: SupabaseClient | null,
  authHeader: string | undefined,
): Promise<PaymentMemberAuthResult> {
  if (!supabaseAdmin || !supabasePublic) {
    console.error("[CRITICAL] Supabase is not configured for payment endpoints.");
    return { ok: false, status: 500, error: GENERIC_CONFIG };
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: GENERIC_AUTH };
  }

  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    return { ok: false, status: 401, error: GENERIC_AUTH };
  }

  const { data: authData, error: authError } = await supabasePublic.auth.getUser(accessToken);
  if (authError || !authData.user) {
    console.error("[PAYMENT_AUTH_FAIL] Invalid or expired token.");
    return { ok: false, status: 401, error: GENERIC_AUTH };
  }

  const { data: ownerProfile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select(USABLE_MEMBER_PROFILE_COLUMNS)
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !isUsableMemberProfile(ownerProfile)) {
    console.error("[PAYMENT_PROFILE_FAIL] Unusable member profile for payment.");
    return { ok: false, status: 400, error: GENERIC_PROFILE };
  }

  const verifiedUserCustomId =
    typeof ownerProfile.user_custom_id === "string" ? ownerProfile.user_custom_id.trim() : "";

  return {
    ok: true,
    user: {
      verifiedUserId: authData.user.id,
      verifiedUserCustomId,
    },
  };
}
