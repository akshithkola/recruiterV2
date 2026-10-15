import React from 'react'
import { getSavedDrafts, saveDraftItem } from '../../../data/savedDraftsStore'
import { apiErrorMessage, createCandidateFromForm } from '../../../services/candidatePayload'
import { filesService, resumeParserService, type ParsedResume } from '../../../services/workspace.service'
import type { AddCandidateVmState } from './useAddCandidatePageState'

export function useAddCandidatePageHandlers1(s: AddCandidateVmState) {
  const {
    onAddCandidate, setIsParsing, parsedFileName, setParsedFileName,
    setShowSuccessToast, setShowSaveDraftToast, setToastMsg, setDraftsList,
    isSaving, setIsSaving, selectedFile, setSelectedFile,
    candidateId, setCandidateId, submissionDate, candidateName,
    setCandidateName, currentCompany, setCurrentCompany, contactNumber,
    setContactNumber, email, setEmail, linkedInUrl,
    setLinkedInUrl, qualification, setQualification, skills,
    setSkills, technologies, setTechnologies, totalExperience,
    setTotalExperience, relevantExperience, setRelevantExperience, currentCtc,
    setCurrentCtc, expectedCtc, setExpectedCtc, noticePeriod,
    setNoticePeriod, currentLocation, setCurrentLocation, preferredLocation,
    setPreferredLocation, interviewAvailability, setInterviewAvailability, offerInHand,
    setOfferInHand, reasonForChange, setReasonForChange, notes,
    setNotes, dupCheckResult,
    importMode, bulkQueue, setBulkQueue, activeQueueId, setActiveQueueId
  } = s

  // Clear all parsed candidate form fields
  const resetCandidateFields = () => {
    setCandidateName('')
    setCurrentCompany('')
    setContactNumber('')
    setEmail('')
    setLinkedInUrl('')
    setQualification('')
    setSkills('')
    setTechnologies('')
    setTotalExperience('')
    setRelevantExperience('')
    setCurrentCtc('')
    setExpectedCtc('')
    setNoticePeriod('')
    setCurrentLocation('')
    setPreferredLocation('')
    setInterviewAvailability('')
    setOfferInHand('Select')
    setReasonForChange('')
    setNotes('')
  }

  // Handle selecting a resume file (drag/drop or browse)
  const handleSelectResumeFile = (file: File) => {
    setSelectedFile(file)
    setParsedFileName(null)
    resetCandidateFields()
  }

  // Fill the form from a parsed resume (fields the resume does not state stay empty for the recruiter).
  const applyParsedToForm = (data: ParsedResume) => {
    resetCandidateFields()
    setCandidateName(data.candidateName || '')
    setCurrentCompany(data.currentCompany || '')
    setContactNumber(data.contactNumber || '')
    setEmail(data.email || '')
    setLinkedInUrl(data.linkedInUrl || '')
    setQualification(data.qualification || '')
    setSkills(data.skills || '')
    setTechnologies(data.technologies || '')
    setTotalExperience(data.totalExperience || '')
    setRelevantExperience(data.relevantExperience || '')
    setCurrentLocation(data.currentLocation || '')
    setParsedFileName(data.sourceFile)
    setNotes(`Parsed from ${data.sourceFile} with ${data.parser === 'metaforge' ? 'Metaforge AI' : 'the local resume parser'}. Review all fields before submitting.`)
  }

  // Single resume: the file itself goes to the backend resume parser (PDF, DOCX, DOC, TXT, images).
  const handleParseResume = async (filePayload?: File) => {
    const fileToParse = filePayload || selectedFile
    if (!fileToParse) {
      showError('Please drag & drop or select a resume file first.')
      return
    }

    if (filePayload) {
      setSelectedFile(filePayload)
    }

    setIsParsing(true)
    resetCandidateFields()

    try {
      const res = await resumeParserService.parse(fileToParse)
      applyParsedToForm(res.data)
      // Keep a copy of the resume in file storage (best effort; parsing does not depend on it).
      filesService.upload(fileToParse).catch(() => undefined)
    } catch (err: any) {
      setParsedFileName(null)
      showError(apiErrorMessage(err))
    } finally {
      setIsParsing(false)
    }
  }


  const showError = (message: string) => {
    setToastMsg(message)
    setTimeout(() => setToastMsg(null), 5000)
  }

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return
    if (dupCheckResult.isDuplicate) {
      showError(`Duplicate submission: ${candidateName || 'this candidate'} has already been submitted for this requirement.`)
      return
    }

    setIsSaving(true)
    try {
      const saved = await createCandidateFromForm({
        name: candidateName,
        email,
        phone: contactNumber,
        linkedIn: linkedInUrl,
        company: currentCompany,
        qualification,
        skills,
        technologies,
        totalExperience,
        relevantExperience,
        currentCtc,
        expectedCtc,
        noticePeriod,
        currentLocation,
        preferredLocation,
        offerInHand,
        interviewAvailability,
        reasonForChange,
        notes,
        status: 'Parsed',
      })
      onAddCandidate?.({
        ...saved,
        interviewAvailability,
        reasonForChange,
        notes,
        resumeName: parsedFileName || undefined,
        submissionDate: saved.submissionDate || submissionDate,
      })
      setShowSuccessToast(true)
      setTimeout(() => setShowSuccessToast(false), 3000)

      const match = candidateId.match(/(\d+)$/)
      if (match) {
        const nextNum = (parseInt(match[1], 10) + 1).toString().padStart(3, '0')
        setCandidateId(`CAND-2026-08-07-${nextNum}`)
      }

      setCandidateName('')
      setCurrentCompany('')
      setContactNumber('')
      setEmail('')
      setLinkedInUrl('')
      setQualification('')
      setSkills('')
      setTechnologies('')
      setTotalExperience('')
      setRelevantExperience('')
      setCurrentCtc('')
      setExpectedCtc('')
      setNoticePeriod('')
      setCurrentLocation('')
      setPreferredLocation('')
      setInterviewAvailability('')
      setOfferInHand('Select')
      setReasonForChange('')
      setNotes('')
      setParsedFileName(null)

      // Bulk import: mark this resume submitted and open the next parsed one for review.
      if (importMode === 'bulk' && activeQueueId) {
        const remaining = bulkQueue.map((q) => (q.id === activeQueueId ? { ...q, status: 'submitted' as const } : q))
        setBulkQueue(remaining)
        const next = remaining.find((q) => q.status === 'parsed')
        setActiveQueueId(next ? next.id : null)
        if (next?.data) applyParsedToForm(next.data)
      }
    } catch (err) {
      showError(apiErrorMessage(err))
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveDraftForLater = () => {
    const draftTitle = candidateName || candidateId || 'Draft Candidate Profile'
    saveDraftItem({
      type: 'candidate',
      title: draftTitle,
      subtitle: `${technologies || 'Technology'} • ${totalExperience || 'Exp'} • Current: ${currentCompany || 'Not specified'} (${currentCtc || 'CTC'})`,
      createdBy: 'Harish Gadipally',
      status: 'Saved for Later',
      data: {
        candidateId,
        submissionDate,
        candidateName,
        currentCompany,
        contactNumber,
        email,
        linkedInUrl,
        qualification,
        skills,
        technologies,
        totalExperience,
        relevantExperience,
        currentCtc,
        expectedCtc,
        noticePeriod,
        currentLocation,
        preferredLocation,
        interviewAvailability,
        offerInHand,
        reasonForChange,
        notes,
        parsedFileName,
      },
    })

    setDraftsList(getSavedDrafts())
    setShowSaveDraftToast(true)
    setTimeout(() => setShowSaveDraftToast(false), 3500)
  }
  return {
    handleParseResume, handleSelectResumeFile, handleSubmit, handleSaveDraftForLater, applyParsedToForm, showError
  }
}
