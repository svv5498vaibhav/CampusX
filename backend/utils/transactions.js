import mongoose from 'mongoose';

let transactionSupport = null;

/**
 * Replica sets and sharded clusters (MongoDB Atlas) support transactions; a standalone server doesn't.
 * Asked once per process (a failed check is asked again next time).
 */
export async function supportsTransactions() {
  if (transactionSupport !== null) return transactionSupport;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    transactionSupport = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  } catch {
    return false;
  }
  return transactionSupport;
}
