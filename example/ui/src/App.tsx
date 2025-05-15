import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowDownToLine, ArrowUpFromLine, X } from "lucide-react"
import { useAccount } from "wagmi"
import { useConnectModal } from "@rainbow-me/rainbowkit"
import QRCode from "react-qr-code"
import { ToastContainer } from "react-toastify"

import { useAssets } from "./hooks/use-assets"
import { registerAztecContracts } from "./utils/aztec"

import ConnectButton from "./components/base/ConnectButton"
import Spinner from "./components/base/Spinner"

import type { Asset } from "./types"
import { useActions } from "./hooks/use-actions"

const App = () => {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)
  const [action, setAction] = useState<"deposit" | "withdraw" | null>(null)
  const [amount, setAmount] = useState("")
  const [url, setUrl] = useState<string | null>(null)

  const { deposit, depositInProgress, isGeneratingProof, withdraw, withdrawInProgress } = useActions()
  const { assets } = useAssets()
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()

  useEffect(() => {
    registerAztecContracts().catch(console.error)
  }, [])

  const openModal = useCallback((asset: Asset, action: "deposit" | "withdraw") => {
    setSelectedAsset(asset)
    setAction(action)
    setAmount("")
  }, [])

  const closeModal = useCallback(() => {
    setSelectedAsset(null)
    setAction(null)
    setAmount("")
  }, [])

  const confirm = useCallback(async () => {
    try {
      closeModal()

      if (!isConnected && openConnectModal) {
        openConnectModal()
        return
      }

      if (action === "deposit") {
        deposit({
          setUrl,
          asset: selectedAsset!,
          amount,
        })
      } else {
        withdraw({
          asset: selectedAsset!,
          amount,
        })
      }
    } catch (err) {
      console.error(err)
    }
  }, [isConnected, amount, action, selectedAsset, openConnectModal, closeModal, deposit, withdraw])

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="sticky top-0 z-50 bg-white/10 backdrop-blur-xl border-b border-white/20 shadow-sm px-6 py-4 flex justify-between items-center"
      >
        <h1 className="text-xl font-semibold tracking-tight">🪙 ZKTokenVault</h1>
        <span className="text-sm text-gray-300">
          <ConnectButton />
        </span>
      </motion.header>

      <div className="min-h-screen bg-gradient-to-br from-white to-gray-100 text-gray-900 px-6 py-6">
        <h1 className="text-lg font-bold mb-5">Your Assets</h1>
        <div className="space-y-4">
          {assets.map((asset) => (
            <div
              key={asset.symbol}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-6 py-4 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <img src={asset.icon} alt={asset.symbol} className="w-8 h-8 rounded-full" />
                <div>
                  <div className="text-lg font-semibold">{asset.symbol}</div>
                  <div className="text-xs text-gray-400">
                    Withdrawable:{" "}
                    <span className="text-gray-600 font-medium">{asset.formattedTargetBalanceWithSymbol}</span> ·
                    Available:{" "}
                    <span className="text-gray-600 font-medium">{asset.formattedSourceBalanceWithSymbol}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={depositInProgress === asset.id}
                  onClick={() => openModal(asset, "deposit")}
                  className="cursor-pointer flex items-center justify-center gap-1 px-4 py-2 bg-indigo-600 text-sm text-white rounded-full transition w-30 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {depositInProgress === asset.id ? (
                    <Spinner />
                  ) : (
                    <>
                      <ArrowDownToLine size={16} />
                      Deposit
                    </>
                  )}
                </button>
                <button
                  onClick={() => openModal(asset, "withdraw")}
                  disabled={withdrawInProgress === asset.id}
                  className="cursor-pointer flex items-center justify-center gap-1 px-4 py-2 bg-pink-600 text-sm text-white rounded-full transition w-30 hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {withdrawInProgress === asset.id ? (
                    <Spinner />
                  ) : (
                    <>
                      <ArrowUpFromLine size={16} />
                      Withdraw
                    </>
                  )}
                </button>
              </div>

              {/* Deposit/Withdraw Modal */}
              <AnimatePresence>
                {selectedAsset && action && (
                  <motion.div
                    className="fixed inset-0 bg-white/80 backdrop-blur-md flex items-center justify-center z-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.div
                      initial={{ y: 60, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 60, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-sm text-center relative shadow-xl"
                    >
                      <button
                        className="absolute top-3 right-3 text-gray-200 hover:text-gray-500 cursor-pointer"
                        onClick={closeModal}
                      >
                        <X size={20} />
                      </button>
                      <h2 className="text-xl font-bold mb-4 capitalize">
                        {action} {selectedAsset.symbol}
                      </h2>
                      <div className="relative mb-2">
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder="Enter amount"
                          className="w-full px-4 pr-16 py-2 rounded-xl border border-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!selectedAsset || !action) return
                            const maxAmount =
                              action === "deposit" ? selectedAsset.sourceBalance! : selectedAsset.targetBalance!
                            setAmount(maxAmount.toString())
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-indigo-600 font-semibold hover:underline focus:outline-none cursor-pointer"
                        >
                          Max
                        </button>
                      </div>
                      <div className="text-right text-xs text-gray-400 mb-6">
                        Available:{" "}
                        <span className="font-medium text-gray-600">
                          {action === "deposit"
                            ? asset.formattedSourceBalanceWithSymbol
                            : asset.formattedTargetBalanceWithSymbol}
                        </span>
                      </div>
                      <button
                        onClick={confirm}
                        className="w-full py-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition cursor-pointer"
                      >
                        Confirm
                      </button>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ZK Passport Modal */}
              <AnimatePresence>
                {url && (
                  <motion.div
                    className="fixed inset-0 bg-white/80 backdrop-blur-md flex items-center justify-center z-50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.div
                      initial={{ y: 60, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 60, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col items-center relative text-center"
                    >
                      <button
                        className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                        onClick={() => setUrl(null)}
                      >
                        <X size={20} />
                      </button>

                      {isGeneratingProof ? (
                        <Spinner size="lg" text="Collecting your anonymized deposit material ..." color="gray-600" />
                      ) : (
                        <>
                          <QRCode value={url || ""} size={240} bgColor="transparent" fgColor="black" className="mt-4" />
                          <p className="mt-6 text-md text-gray-600 leading-relaxed max-w-xs">
                            Scan this QR code to open the <span className="text-black font-semibold">zkPassport</span>{" "}
                            app on your phone, or click{" "}
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 underline font-semibold"
                            >
                              here
                            </a>{" "}
                            instead.
                          </p>
                        </>
                      )}
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
      <ToastContainer position="top-right" autoClose={3000} theme="light" />
    </>
  )
}

export default App
