/** Contract fixed-point base (CampaignV3.RAY). */
export const RAY = 10n ** 27n;

/** secp256k1 half order — CampaignV3 accepts low-s signatures only (EIP-2). */
export const SECP256K1_HALF_N = BigInt(
  "0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0"
);
