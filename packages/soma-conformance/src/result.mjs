export function checkResult(id, failures, successReasons = []) {
  return {
    id,
    result: failures.length === 0 ? "pass" : "fail",
    reasons: failures.length === 0 ? successReasons : failures,
  };
}

export function notRun(id, reason) {
  return { id, result: "not_run", reasons: [reason] };
}
