import { hexToBytes } from "viem"

export const hexToUintArray = (str: `0x${string}`) => Array.from(hexToBytes(str))
