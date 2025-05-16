import { Loader2 } from "lucide-react"

export interface SpinnerProps {
  size?: "sm" | "md" | "lg"
  text?: string | null
  color?: string
}

const Spinner = ({ size = "sm", text = null, color = "white" }: SpinnerProps) => {
  return (
    <div className="flex flex-col items-center space-y-4">
      <Loader2
        className={`${size === "sm" ? "h-5 w-5" : size === "lg" ? "h-12 w-12" : "h-8 w-8"} animate-spin text-${color}`}
      />
      {text && <p className="text-md text-gray-600">{text}</p>}
    </div>
  )
}

export default Spinner
