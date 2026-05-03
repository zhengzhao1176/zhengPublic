import jwt from 'jsonwebtoken'

export type JwtPayload = { id: number; username: string }

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-do-not-use-in-prod'
const EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d'

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN } as jwt.SignOptions)
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, SECRET) as JwtPayload & jwt.JwtPayload
  return { id: decoded.id, username: decoded.username }
}

export const COOKIE_NAME = 'inv_token'
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7
