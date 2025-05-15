import { ConnectButton } from "@rainbow-me/rainbowkit"
import { ArrowDown } from "lucide-react"

import type { FC } from "react"

const CustomConnectButton: FC = () => {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
        chainModalOpen,
      }: any) => {
        const ready = mounted && authenticationStatus !== "loading"
        const connected =
          ready && account && chain && (!authenticationStatus || authenticationStatus === "authenticated")

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none",
                userSelect: "none",
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    className="pt-2 pb-2 pl-4 pr-4 bg-purple-200 text-purple-500 rounded-3xl font-semibold text-lg hover:text-opacity-50 cursor-pointer"
                  >
                    Connect
                  </button>
                )
              }

              return (
                <div className="flex justify-between items-center">
                  {!chain.unsupported && (
                    <button
                      onClick={openChainModal}
                      className="flex justify-between items-center bg-gray-100 hover:bg-gray-200 pt-1 pb-1 pl-2 pr-2 rounded-2xl ml-1 mr-2 cursor-pointer"
                      type="button"
                    >
                      {chain.hasIcon && (
                        <div className="flex items-center space-x-1 w-6 h-6">
                          {chain.iconUrl && (
                            <img
                              className="rounded-full w-6 h-6"
                              alt={chain.name ?? "Chain icon"}
                              src={chain.iconUrl}
                            />
                          )}
                          <ArrowDown
                            className={`h-4 w-4 transform transition-transform duration-200 ${
                              chainModalOpen ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      )}
                    </button>
                  )}
                  <button
                    onClick={openAccountModal}
                    type="button"
                    className="pt-1 pb-1 pl-2 pr-2 bg-gray-100 rounded-3xl text-md hover:bg-gray-200 text-gray-600 font-medium cursor-pointer"
                  >
                    {account.displayName}
                  </button>
                </div>
              )
            })()}
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}

export default CustomConnectButton
