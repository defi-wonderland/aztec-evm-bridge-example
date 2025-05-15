import { Loader2 } from "lucide-react"

const Spinner = () => {
  return (
    <div className="flex items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-white" />
    </div>
  )
}

export default Spinner
