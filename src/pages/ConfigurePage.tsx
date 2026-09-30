// "Add new" tab: select a data set, data element, (disaggregation),
// org unit level and outlier threshold; preview the generated metadata;
// import it.
import i18n from '@dhis2/d2-i18n'
import {
    Button,
    ButtonStrip,
    Modal,
    ModalActions,
    ModalContent,
    ModalTitle,
    NoticeBox,
    Radio,
    SingleSelectField,
    SingleSelectOption,
} from '@dhis2/ui'
import { useQueryClient } from '@tanstack/react-query'
import React, { useRef, useState } from 'react'
import styles from './ConfigurePage.module.css'
import { ImportResultsTable } from '@/components/ImportResultsTable'
import { LoadingLayer } from '@/components/LoadingLayer'
import { Panel } from '@/components/Panel'
import { PreviewSection } from '@/components/PreviewSection'
import {
    ThresholdField,
    OutlierMethod,
    defaultThreshold,
    isValidThreshold,
} from '@/components/ThresholdField'
import {
    useDataElements,
    useDataSets,
    useOuLevels,
    DataElementOption,
} from '@/hooks/queries'
import { useApi } from '@/hooks/useApi'
import { useAppAlerts } from '@/hooks/useAppAlerts'
import { errorMessage } from '@/lib/api'
import { buildPendingImport, CompletenessApproach } from '@/lib/configure'
import { runImport } from '@/lib/importer'
import { formatOuLevelName } from '@/lib/labels'
import { BaseConfig, ImportResultRow, PendingImport } from '@/lib/types'

const TOTAL = '__total__'

export const ConfigurePage = ({ baseConfig }: { baseConfig: BaseConfig }) => {
    const api = useApi()
    const alerts = useAppAlerts()
    const queryClient = useQueryClient()

    const [dataSetId, setDataSetId] = useState<string>()
    const [dataElementId, setDataElementId] = useState<string>()
    const [disaggregation, setDisaggregation] = useState<string>()
    const [completenessApproach, setCompletenessApproach] = useState<
        'proxy' | 'anyValue'
    >('proxy')
    const [proxyOperandId, setProxyOperandId] = useState<string>()
    const [ouLevelId, setOuLevelId] = useState<string>()
    const [outlierMethod, setOutlierMethod] = useState<OutlierMethod>('modZ')
    const [threshold, setThreshold] = useState(defaultThreshold('modZ'))

    const [busy, setBusy] = useState(false)
    const [pending, setPending] = useState<PendingImport | null>(null)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [importResults, setImportResults] = useState<
        ImportResultRow[] | null
    >(null)

    const previewRef = useRef<HTMLDivElement>(null)

    const dataSets = useDataSets()
    const dataElements = useDataElements(dataSetId)
    const ouLevels = useOuLevels(dataSetId)

    const selectedDataElement: DataElementOption | undefined =
        dataElements.data?.find((option) => option.id === dataElementId)
    const isDisaggregated = Boolean(
        selectedDataElement &&
        selectedDataElement.catComboName.toLowerCase() !== 'default'
    )
    const showCompletenessChoice = isDisaggregated && disaggregation === TOTAL
    const overrideSuffix =
        selectedDataElement?.catComboSource === 'data set override'
            ? i18n.t(' — from data set override')
            : ''

    // Effective source: operand id (deId.cocId) when a single
    // disaggregation was picked, otherwise the bare data element id
    const effectiveDeSourceId =
        dataElementId &&
        isDisaggregated &&
        disaggregation &&
        disaggregation !== TOTAL
            ? `${dataElementId}.${disaggregation}`
            : dataElementId

    const thresholdValid = isValidThreshold(threshold, outlierMethod)

    const canPreview = Boolean(
        dataSetId &&
        dataElementId &&
        (!isDisaggregated || disaggregation) &&
        ouLevelId &&
        thresholdValid &&
        (!showCompletenessChoice ||
            completenessApproach !== 'proxy' ||
            proxyOperandId)
    )

    const clearPreview = () => {
        setPending(null)
        setImportResults(null)
    }

    const onPreview = async () => {
        setBusy(true)
        clearPreview()
        try {
            const result = await buildPendingImport(
                api,
                {
                    deSourceId: effectiveDeSourceId as string,
                    dataSetId: dataSetId as string,
                    ouLevelId: ouLevelId as string,
                    outlierMethod,
                    threshold,
                    completenessApproach: showCompletenessChoice
                        ? (completenessApproach as CompletenessApproach)
                        : 'standard',
                    proxyOperandId,
                    userGroupId: baseConfig.userGroup,
                },
                alerts.showWarning
            )
            setPending(result)
            if (result.conflicts.size > 0) {
                alerts.showWarning(
                    result.conflicts.size === 1
                        ? i18n.t(
                              '1 name/shortName conflict found — highlighted in preview.'
                          )
                        : i18n.t(
                              '{{total}} name/shortName conflicts found — highlighted in preview.',
                              { total: result.conflicts.size }
                          )
                )
            }
            setTimeout(() => {
                previewRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                })
            }, 100)
        } catch (error) {
            console.error('Preview configuration failed:', error)
            alerts.showError(
                i18n.t('Failed to preview configuration ({{- message}})', {
                    message: errorMessage(error),
                })
            )
        } finally {
            setBusy(false)
        }
    }

    const onImport = async () => {
        if (!pending || busy) {
            return
        }
        setConfirmOpen(false)
        setBusy(true)
        try {
            const results = await runImport(api, pending, baseConfig)
            setImportResults(results)
            setPending(null)
            // New config affects the overview and the disabled DEs
            await queryClient.invalidateQueries({ queryKey: ['overview'] })
            await queryClient.invalidateQueries({ queryKey: ['dataElements'] })
        } catch (error) {
            alerts.showError(
                i18n.t('Import failed ({{- message}})', {
                    message: errorMessage(error),
                })
            )
        } finally {
            setBusy(false)
        }
    }

    const hasConflicts = Boolean(pending && pending.conflicts.size > 0)

    return (
        <div>
            {busy && <LoadingLayer />}

            <Panel narrow>
                <h2>{i18n.t('Configure data quality metadata')}</h2>
                <NoticeBox>
                    {i18n.t(
                        'All fields are required. Select a data set to begin.'
                    )}
                </NoticeBox>

                <div className={styles.formField}>
                    <SingleSelectField
                        label={i18n.t('Data set')}
                        filterable
                        noMatchText={i18n.t('No data sets match the filter')}
                        loading={dataSets.isLoading}
                        error={Boolean(dataSets.error)}
                        validationText={
                            dataSets.error
                                ? i18n.t(
                                      'Failed to load data sets ({{- message}})',
                                      {
                                          message: errorMessage(dataSets.error),
                                      }
                                  )
                                : undefined
                        }
                        selected={dataSetId}
                        onChange={({ selected }) => {
                            setDataSetId(selected)
                            setDataElementId(undefined)
                            setDisaggregation(undefined)
                            setProxyOperandId(undefined)
                            setOuLevelId(undefined)
                            clearPreview()
                        }}
                    >
                        {(dataSets.data || []).map((dataSet) => (
                            <SingleSelectOption
                                key={dataSet.id}
                                value={dataSet.id}
                                label={dataSet.displayName}
                            />
                        ))}
                    </SingleSelectField>
                </div>

                <div className={styles.formField}>
                    <SingleSelectField
                        label={i18n.t('Data element')}
                        filterable
                        noMatchText={i18n.t(
                            'No data elements match the filter'
                        )}
                        loading={Boolean(dataSetId) && dataElements.isLoading}
                        disabled={!dataSetId}
                        selected={dataElementId}
                        error={Boolean(dataElements.error)}
                        validationText={
                            dataElements.error
                                ? i18n.t(
                                      'Failed to load data elements ({{- message}})',
                                      {
                                          message: errorMessage(
                                              dataElements.error
                                          ),
                                      }
                                  )
                                : undefined
                        }
                        helpText={i18n.t(
                            'Only numeric data elements are listed. Data elements that are already configured are disabled.'
                        )}
                        onChange={({ selected }) => {
                            setDataElementId(selected)
                            setDisaggregation(undefined)
                            setProxyOperandId(undefined)
                            clearPreview()
                        }}
                    >
                        {(dataElements.data || []).map((dataElement) => (
                            <SingleSelectOption
                                key={dataElement.id}
                                value={dataElement.id}
                                label={dataElement.name}
                                disabled={dataElement.alreadyConfigured}
                            />
                        ))}
                    </SingleSelectField>
                </div>

                {isDisaggregated && selectedDataElement && (
                    <div className={styles.formField}>
                        <SingleSelectField
                            label={i18n.t('Disaggregation')}
                            filterable
                            noMatchText={i18n.t(
                                'No disaggregations match the filter'
                            )}
                            selected={disaggregation}
                            onChange={({ selected }) => {
                                setDisaggregation(selected)
                                setProxyOperandId(undefined)
                                clearPreview()
                            }}
                        >
                            <SingleSelectOption
                                value={TOTAL}
                                label={
                                    i18n.t(
                                        'Total (all disaggregations combined)'
                                    ) + overrideSuffix
                                }
                            />
                            {selectedDataElement.cocs.map((coc) => (
                                <SingleSelectOption
                                    key={coc.id}
                                    value={coc.id}
                                    label={coc.name + overrideSuffix}
                                />
                            ))}
                        </SingleSelectField>
                    </div>
                )}

                {showCompletenessChoice && selectedDataElement && (
                    <div className={styles.formField}>
                        <p className={styles.tableLabel}>
                            {i18n.t('Disaggregation completeness approach')}
                        </p>
                        <div className={styles.radioGroup}>
                            <Radio
                                label={i18n.t(
                                    'Use one category option combo as proxy'
                                )}
                                checked={completenessApproach === 'proxy'}
                                onChange={() => {
                                    setCompletenessApproach('proxy')
                                    clearPreview()
                                }}
                            />
                            <Radio
                                label={i18n.t(
                                    'Count as complete when any category option combo has a value'
                                )}
                                checked={completenessApproach === 'anyValue'}
                                onChange={() => {
                                    setCompletenessApproach('anyValue')
                                    setProxyOperandId(undefined)
                                    clearPreview()
                                }}
                            />
                        </div>
                        {completenessApproach === 'proxy' && (
                            <SingleSelectField
                                label={i18n.t('Disaggregation to use as proxy')}
                                filterable
                                noMatchText={i18n.t(
                                    'No disaggregations match the filter'
                                )}
                                selected={proxyOperandId}
                                onChange={({ selected }) => {
                                    setProxyOperandId(selected)
                                    clearPreview()
                                }}
                            >
                                {selectedDataElement.cocs.map((coc) => (
                                    <SingleSelectOption
                                        key={coc.id}
                                        value={`${selectedDataElement.id}.${coc.id}`}
                                        label={coc.name}
                                    />
                                ))}
                            </SingleSelectField>
                        )}
                    </div>
                )}

                <div className={styles.formField}>
                    <SingleSelectField
                        label={i18n.t('Organisation unit level')}
                        filterable
                        noMatchText={i18n.t('No levels match the filter')}
                        loading={Boolean(dataSetId) && ouLevels.isLoading}
                        disabled={!dataSetId}
                        error={Boolean(ouLevels.error)}
                        validationText={
                            ouLevels.error
                                ? i18n.t(
                                      'Failed to load organisation unit levels ({{- message}})',
                                      {
                                          message: errorMessage(ouLevels.error),
                                      }
                                  )
                                : undefined
                        }
                        selected={ouLevelId}
                        onChange={({ selected }) => {
                            setOuLevelId(selected)
                            clearPreview()
                        }}
                    >
                        {(ouLevels.data || []).map((level) => (
                            <SingleSelectOption
                                key={level.id}
                                value={level.id}
                                disabled={!level.assigned}
                                label={
                                    formatOuLevelName(
                                        level.level,
                                        level.displayName
                                    ) +
                                    (level.assigned
                                        ? ''
                                        : i18n.t(' (not assigned to data set)'))
                                }
                            />
                        ))}
                    </SingleSelectField>
                </div>

                <div className={styles.formField}>
                    <SingleSelectField
                        label={i18n.t('Outlier detection method')}
                        selected={outlierMethod}
                        onChange={({ selected }) => {
                            const method = selected as OutlierMethod
                            setOutlierMethod(method)
                            setThreshold(defaultThreshold(method))
                            clearPreview()
                        }}
                    >
                        <SingleSelectOption
                            value="modZ"
                            label={i18n.t('Modified Z-score (recommended)')}
                        />
                        <SingleSelectOption
                            value="sd"
                            label={i18n.t('Standard deviations from mean')}
                        />
                    </SingleSelectField>
                </div>

                <div className={styles.formField}>
                    <ThresholdField
                        label={
                            outlierMethod === 'modZ'
                                ? i18n.t('Outlier threshold (modified Z-score)')
                                : i18n.t(
                                      'Outlier threshold (standard deviations from mean)'
                                  )
                        }
                        method={outlierMethod}
                        value={threshold}
                        onChange={(value) => {
                            setThreshold(value)
                            clearPreview()
                        }}
                    />
                </div>

                <Button
                    primary
                    disabled={!canPreview || busy}
                    onClick={onPreview}
                >
                    {i18n.t('Preview')}
                </Button>
            </Panel>

            {pending && (
                <div ref={previewRef} className={styles.section}>
                    <Panel>
                        <h3>{i18n.t('Preview')}</h3>
                        <PreviewSection pending={pending} />
                        <div className={styles.actions}>
                            <Button
                                primary
                                disabled={hasConflicts || busy}
                                onClick={() => setConfirmOpen(true)}
                            >
                                {i18n.t('Import')}
                            </Button>
                            {hasConflicts && (
                                <span className={styles.conflictLegend}>
                                    ⚠ {i18n.t('already exists')}
                                </span>
                            )}
                        </div>
                    </Panel>
                </div>
            )}

            {importResults && (
                <div className={styles.section}>
                    <Panel>
                        <h3>{i18n.t('Import results')}</h3>
                        <ImportResultsTable results={importResults} />
                        <div className={styles.actions}>
                            <Button
                                secondary
                                onClick={() => setImportResults(null)}
                            >
                                {i18n.t('Close')}
                            </Button>
                        </div>
                    </Panel>
                </div>
            )}

            {confirmOpen && pending && (
                <Modal position="middle" onClose={() => setConfirmOpen(false)}>
                    <ModalTitle>{i18n.t('Confirm import')}</ModalTitle>
                    <ModalContent>
                        {i18n.t(
                            "Configure data quality metrics metadata for '{{- name}}'?",
                            {
                                name: pending.outlier.config[
                                    '§NAME§'
                                ] as string,
                            }
                        )}
                    </ModalContent>
                    <ModalActions>
                        <ButtonStrip end>
                            <Button
                                secondary
                                onClick={() => setConfirmOpen(false)}
                            >
                                {i18n.t('Cancel')}
                            </Button>
                            <Button primary disabled={busy} onClick={onImport}>
                                {i18n.t('Import')}
                            </Button>
                        </ButtonStrip>
                    </ModalActions>
                </Modal>
            )}
        </div>
    )
}
