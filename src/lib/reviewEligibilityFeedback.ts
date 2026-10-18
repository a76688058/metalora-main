export const REVIEW_ELIGIBILITY_SYNC_ERROR =
  '배송완료는 저장되었습니다. 리뷰 가능 상태 동기화에 실패했습니다. 다시 시도해 주세요.';

/** Completion is already stored. This only decides the follow-up message and whether retry is offered. */
export function completionSyncFeedback(recorded: boolean): {
  showCompletionSuccess: boolean;
  offerRetry: boolean;
  message: string | null;
} {
  if (recorded) return { showCompletionSuccess: true, offerRetry: false, message: null };
  return { showCompletionSuccess: false, offerRetry: true, message: REVIEW_ELIGIBILITY_SYNC_ERROR };
}
