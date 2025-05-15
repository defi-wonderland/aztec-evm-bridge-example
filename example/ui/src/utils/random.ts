const randomHexString = (length: number): string => {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("")
}

export const randomBigIntN = (n: number): bigint => {
  const hexLength = Math.ceil(n / 4)
  const hex = randomHexString(hexLength)
  return BigInt.asUintN(n, BigInt(`0x${hex}`))
}

export const randomUint32 = (): number => {
  return Number(randomBigIntN(32))
}

export const randomUint64 = (): bigint => {
  return randomBigIntN(64)
}
