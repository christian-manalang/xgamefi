import { registerWorker } from "@xgamefi/shared/queues";
import { referralRewardProcessor } from "./processor";

export function registerReferralRewardWorker() {
  return registerWorker("referral-reward", referralRewardProcessor);
}
