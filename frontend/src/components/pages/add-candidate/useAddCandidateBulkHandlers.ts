import { apiErrorMessage } from '../../../services/candidatePayload'
import { RESUME_BULK_BATCH, resumeParserService, type ParsedResume } from '../../../services/workspace.service'
import type { AddCandidateVmState, BulkQueueItem } from './useAddCandidatePageState'

const ALLOWED = /\.(pdf|docx?|txt|png|jpe?g|webp|bmp|tiff?)$/i
const MAX_BYTES = 15 * 1024 * 1024

/**
 * Bulk import: resumes are queued, parsed by the backend in batches of RESUME_BULK_BATCH,
 * and stay in the queue until the recruiter reviews and submits (or removes) each one.
 */
export function useAddCandidateBulkHandlers(
  s: AddCandidateVmState,
  h: { applyParsedToForm: (d: ParsedResume) => void; showError: (m: string) => void },
) {
  const { bulkQueue, setBulkQueue, activeQueueId, setActiveQueueId } = s

  const patch = (ids: string[], update: (q: BulkQueueItem) => Partial<BulkQueueItem>) =>
    setBulkQueue((prev) => prev.map((q) => (ids.includes(q.id) ? { ...q, ...update(q) } : q)))

  const parseItems = async (items: BulkQueueItem[]) => {
    for (let i = 0; i < items.length; i += RESUME_BULK_BATCH) {
      const batch = items.slice(i, i + RESUME_BULK_BATCH)
      const ids = batch.map((b) => b.id)
      patch(ids, () => ({ status: 'parsing', error: undefined }))
      try {
        const res = await resumeParserService.parseBulk(batch.map((b) => b.file))
        const results = res.results || []
        setBulkQueue((prev) =>
          prev.map((q) => {
            const idx = ids.indexOf(q.id)
            if (idx === -1) return q
            const r = results[idx]
            if (r?.status === 'done' && r.data) return { ...q, status: 'parsed', data: r.data, error: undefined }
            return { ...q, status: 'failed', error: r?.error || 'Could not parse this resume' }
          }),
        )
        if (res.notice) h.showError(`Parsed with the local parser: ${res.notice}`)
      } catch (err) {
        patch(ids, () => ({ status: 'failed', error: apiErrorMessage(err) }))
      }
    }
  }

  const handleAddBulkFiles = (files: File[]) => {
    const accepted: BulkQueueItem[] = []
    const rejected: string[] = []
    files.forEach((file, i) => {
      if (!ALLOWED.test(file.name) || file.size > MAX_BYTES) {
        rejected.push(file.name)
        return
      }
      accepted.push({ id: `${Date.now()}-${i}-${file.name}`, file, status: 'queued' })
    })
    if (rejected.length) h.showError(`Skipped (unsupported type or over 15 MB): ${rejected.join(', ')}`)
    if (!accepted.length) return
    setBulkQueue((prev) => [...prev, ...accepted])
    void parseItems(accepted)
  }

  const handleReviewQueueItem = (id: string) => {
    const item = bulkQueue.find((q) => q.id === id)
    if (!item?.data) return
    setActiveQueueId(id)
    h.applyParsedToForm(item.data)
  }

  const handleRetryQueueItem = (id: string) => {
    const item = bulkQueue.find((q) => q.id === id)
    if (item) void parseItems([item])
  }

  const handleRemoveQueueItem = (id: string) => {
    setBulkQueue((prev) => prev.filter((q) => q.id !== id))
    if (activeQueueId === id) setActiveQueueId(null)
  }

  const handleClearSubmitted = () => setBulkQueue((prev) => prev.filter((q) => q.status !== 'submitted'))

  return { handleAddBulkFiles, handleReviewQueueItem, handleRetryQueueItem, handleRemoveQueueItem, handleClearSubmitted }
}
