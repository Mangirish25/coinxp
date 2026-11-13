export function unexpectedExpensePaise(transactions) {
  return transactions.reduce((total,transaction) => total + (transaction.type === 'expense' && transaction.isUnexpected ? BigInt(transaction.amountPaise) : 0n),0n);
}

export function adherenceSpendPaise(transactions) {
  const total = transactions.reduce((sum,transaction) => sum + (transaction.type === 'expense' ? BigInt(transaction.amountPaise) : 0n),0n);
  return total - unexpectedExpensePaise(transactions);
}

export function correctionAmnestyPaise(asOfWindowEndPaise, asOfCutoffPaise, now, cutoffAt) {
  if (now.getTime() < new Date(cutoffAt).getTime()) return 0;
  const correction = BigInt(asOfWindowEndPaise) - BigInt(asOfCutoffPaise);
  return Number(correction > 0n ? correction : 0n);
}

export function evaluatedSpendPaise(currentPaise, amnestyPaise) {
  const result = BigInt(currentPaise) - BigInt(amnestyPaise);
  return Number(result > 0n ? result : 0n);
}
