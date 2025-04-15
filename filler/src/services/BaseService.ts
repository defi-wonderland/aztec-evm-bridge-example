import { Db } from "mongodb"
import { Logger } from "winston"

export type BaseServiceOpts = {
  db: Db
  logger: Logger
}

class BaseService {
  db: Db
  logger: Logger

  constructor(opts: BaseServiceOpts) {
    this.logger = opts.logger.child({ service: this.constructor.name })
    this.db = opts.db
  }
}

export default BaseService
