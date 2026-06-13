import { MemoryAdapter } from '@xnetjs/storage'
import { runStorageAdapterContract } from './contract'

// The fake side of the parity check: the same contract the S3 adapter must satisfy.
runStorageAdapterContract('MemoryAdapter (fake)', async () => new MemoryAdapter())
