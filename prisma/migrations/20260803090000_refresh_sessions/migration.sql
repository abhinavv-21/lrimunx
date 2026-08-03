-- Refresh sessions — makes signing out actually end a session.
--
-- Purely additive. Nothing existing is altered or dropped, so applying this to
-- a live database changes no row that is already there.
--
-- One consequence worth stating plainly: refresh tokens issued BEFORE this
-- migration have no row here, and the refresh endpoint now requires one. Every
-- signed-in operator is asked to sign in again once, at their next refresh.
-- That is the intended behaviour of turning revocation on — a token that
-- predates the guest list cannot be checked against it.

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- The hash is what arrives on a request, so it is the lookup key. Unique
-- because two live sessions sharing one token would make revocation ambiguous.
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- "everything belonging to this user", for signing out everywhere.
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- "everything past its expiry", for sweeping dead rows.
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- Deleting an account ends its sessions in the same statement. Without this a
-- deleted operator's refresh token would outlive the account it belonged to.
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
