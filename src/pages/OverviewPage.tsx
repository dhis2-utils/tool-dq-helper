// "Configuration" tab: one card per configured data element with status
// chips, expandable details, inline outlier-threshold editing and
// removal (with optional, safety-gated metadata deletion).
import i18n from '@dhis2/d2-i18n'
import {
    Button,
    ButtonStrip,
    Center,
    Checkbox,
    CircularLoader,
    DataTable,
    DataTableBody,
    DataTableCell,
    DataTableColumnHeader,
    DataTableHead,
    DataTableRow,
    Modal,
    ModalActions,
    ModalContent,
    ModalTitle,
    NoticeBox,
    Tag,
    Tooltip,
} from '@dhis2/ui'
import { useQueryClient } from '@tanstack/react-query'
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import styles from './OverviewPage.module.css'
import { LoadingLayer } from '@/components/LoadingLayer'
import { Panel } from '@/components/Panel'
import {
    ThresholdField,
    OutlierMethod,
    isValidThreshold,
} from '@/components/ThresholdField'
import { useOverview } from '@/hooks/queries'
import { useApi } from '@/hooks/useApi'
import { useAppAlerts } from '@/hooks/useAppAlerts'
import { errorMessage } from '@/lib/api'
import { deleteConfiguration } from '@/lib/deletion'
import { CHECK_TYPES, checkTypeLabel, labelMapsByCheck } from '@/lib/labels'
import { ConfiguredElement } from '@/lib/overview'
import { updateOutlierThreshold } from '@/lib/threshold'
import { BaseConfig, CheckType, PlaceholderConfig } from '@/lib/types'

const configChipLabel = (
    checkType: CheckType,
    config: PlaceholderConfig
): string => {
    if (checkType === 'outliers' && config['§THRESHOLD_DESC§']) {
        return i18n.t('Outliers ({{- desc}})', {
            desc: config['§THRESHOLD_DESC§'],
        })
    }
    if (checkType === 'outliers' && config['§VAL_STDDEV§']) {
        return i18n.t('Outliers ({{- sd}} SD)', { sd: config['§VAL_STDDEV§'] })
    }
    return checkTypeLabel(checkType)
}

const ConfigDetails = ({
    element,
    ouLevelNames,
}: {
    element: ConfiguredElement
    ouLevelNames: Record<string, string>
}) => (
    <details className={styles.details}>
        <summary>{i18n.t('Show details')}</summary>
        {CHECK_TYPES.filter((checkType) => element.configs[checkType]).map(
            (checkType) => {
                const config = element.configs[checkType] as PlaceholderConfig
                const labelMap = labelMapsByCheck()[checkType]
                const items = Object.keys(labelMap)
                    .filter((placeholder) => config[placeholder])
                    .map((placeholder) => ({
                        type: labelMap[placeholder][0],
                        label: labelMap[placeholder][1],
                        id: config[placeholder] as string,
                    }))
                return (
                    <div key={checkType} className={styles.configSection}>
                        <h5>{checkTypeLabel(checkType)}</h5>
                        <dl className={styles.settings}>
                            <dt>{i18n.t('Data element ID')}</dt>
                            <dd>
                                <code>{element.id}</code>
                            </dd>
                            {config['§THRESHOLD_DESC§'] ? (
                                <>
                                    <dt>{i18n.t('Outlier threshold')}</dt>
                                    <dd>{config['§THRESHOLD_DESC§']}</dd>
                                </>
                            ) : (
                                config['§VAL_STDDEV§'] && (
                                    <>
                                        <dt>{i18n.t('Standard deviations')}</dt>
                                        <dd>{config['§VAL_STDDEV§']}</dd>
                                    </>
                                )
                            )}
                            {config['§OU_LEVEL§'] && (
                                <>
                                    <dt>{i18n.t('Org unit level')}</dt>
                                    <dd>
                                        {ouLevelNames[
                                            config['§OU_LEVEL§'] as string
                                        ] || config['§OU_LEVEL§']}
                                    </dd>
                                </>
                            )}
                            {config['§NAME_DS§'] && (
                                <>
                                    <dt>{i18n.t('Data set')}</dt>
                                    <dd>{config['§NAME_DS§']}</dd>
                                </>
                            )}
                        </dl>
                        {items.length > 0 && (
                            <DataTable className={styles.metadataTable}>
                                <DataTableHead>
                                    <DataTableRow>
                                        <DataTableColumnHeader>
                                            {i18n.t('Type')}
                                        </DataTableColumnHeader>
                                        <DataTableColumnHeader>
                                            {i18n.t('Description')}
                                        </DataTableColumnHeader>
                                        <DataTableColumnHeader>
                                            {i18n.t('UID')}
                                        </DataTableColumnHeader>
                                    </DataTableRow>
                                </DataTableHead>
                                <DataTableBody>
                                    {items.map((item) => (
                                        <DataTableRow key={item.id}>
                                            <DataTableCell>
                                                {item.type}
                                            </DataTableCell>
                                            <DataTableCell>
                                                {item.label}
                                            </DataTableCell>
                                            <DataTableCell>
                                                <code>{item.id}</code>
                                            </DataTableCell>
                                        </DataTableRow>
                                    ))}
                                </DataTableBody>
                            </DataTable>
                        )}
                    </div>
                )
            }
        )}
    </details>
)

const EditThresholdForm = ({
    currentSD,
    method,
    busy,
    onSave,
    onCancel,
}: {
    currentSD: string
    method: OutlierMethod
    busy: boolean
    onSave: (newSD: string) => void
    onCancel: () => void
}) => {
    const [value, setValue] = useState(currentSD)
    const valid = isValidThreshold(value, method)
    return (
        <div className={styles.editForm}>
            <ThresholdField
                label={
                    method === 'modZ'
                        ? i18n.t('New outlier threshold (modified Z-score)')
                        : i18n.t('New outlier threshold (standard deviations)')
                }
                method={method}
                value={value}
                onChange={setValue}
            />
            <div className={styles.editActions}>
                <Button
                    primary
                    small
                    disabled={!valid || busy}
                    onClick={() => {
                        if (value === currentSD) {
                            onCancel()
                            return
                        }
                        onSave(value)
                    }}
                >
                    {i18n.t('Save')}
                </Button>
                <Button small secondary onClick={onCancel} disabled={busy}>
                    {i18n.t('Cancel')}
                </Button>
            </div>
            <p className={styles.editHint}>
                {i18n.t(
                    'To change data element or org unit level, remove and re-create the configuration.'
                )}
            </p>
        </div>
    )
}

export const OverviewPage = ({
    baseConfig,
    active,
}: {
    baseConfig: BaseConfig
    // The page stays mounted when its tab is hidden (see AppRoutes);
    // don't fetch until the user first opens the tab
    active: boolean
}) => {
    const api = useApi()
    const alerts = useAppAlerts()
    const queryClient = useQueryClient()
    const overview = useOverview(active)

    const [editingId, setEditingId] = useState<string | null>(null)
    const [deleting, setDeleting] = useState<{
        id: string
        name: string
    } | null>(null)
    const [alsoDeleteMetadata, setAlsoDeleteMetadata] = useState(false)
    const [busy, setBusy] = useState(false)

    const refresh = async () => {
        await queryClient.invalidateQueries({ queryKey: ['overview'] })
        await queryClient.invalidateQueries({ queryKey: ['dataElements'] })
    }

    const onSaveThreshold = async (deId: string, newSD: string) => {
        setBusy(true)
        try {
            await updateOutlierThreshold(api, deId, newSD)
            alerts.showSuccess(
                i18n.t('Outlier threshold updated to {{- value}}.', {
                    value: newSD,
                })
            )
            setEditingId(null)
            await refresh()
        } catch (error) {
            alerts.showError(
                i18n.t('Failed to update threshold ({{- message}})', {
                    message: errorMessage(error),
                })
            )
        } finally {
            setBusy(false)
        }
    }

    const onConfirmDelete = async () => {
        if (!deleting) {
            return
        }
        const { id, name } = deleting
        setDeleting(null)
        setBusy(true)
        try {
            const outcome = await deleteConfiguration(api, {
                baseConfig,
                deId: id,
                deName: name,
                alsoDeleteMetadata,
            })
            if (outcome.hasWarnings) {
                alerts.showWarning(outcome.message)
            } else {
                alerts.showSuccess(outcome.message)
            }
            await refresh()
        } catch (error) {
            alerts.showError(
                i18n.t('Failed to remove configuration ({{- message}})', {
                    message: errorMessage(error),
                })
            )
        } finally {
            setBusy(false)
        }
    }

    if (overview.isLoading) {
        return (
            <Center>
                <CircularLoader />
            </Center>
        )
    }

    if (overview.error) {
        return (
            <NoticeBox error title={i18n.t('Failed to load configurations')}>
                {errorMessage(overview.error)}
            </NoticeBox>
        )
    }

    const { elements, ouLevelNames } = overview.data as {
        elements: ConfiguredElement[]
        ouLevelNames: Record<string, string>
    }

    if (elements.length === 0) {
        return (
            <Panel narrow>
                <p>{i18n.t('No data elements configured yet.')}</p>
                <p>
                    {i18n.t('Go to the')}{' '}
                    <Link to="/">{i18n.t('Add new')}</Link>{' '}
                    {i18n.t('tab to get started.')}
                </p>
            </Panel>
        )
    }

    return (
        <div>
            {busy && <LoadingLayer />}
            <div className={styles.summary}>
                {elements.length === 1
                    ? i18n.t('1 data element configured')
                    : i18n.t('{{total}} data elements configured', {
                          total: elements.length,
                      })}
            </div>
            <div className={styles.grid}>
                {elements.map((element) => (
                    <Panel key={element.id}>
                        <div className={styles.cardHeader}>
                            <div className={styles.cardTitle}>
                                <h4>{element.name}</h4>
                                <div className={styles.cardMeta}>
                                    {element.dataSet}
                                </div>
                            </div>
                            <div className={styles.cardActions}>
                                {element.configs.outliers && (
                                    <Button
                                        small
                                        secondary
                                        onClick={() =>
                                            setEditingId(
                                                editingId === element.id
                                                    ? null
                                                    : element.id
                                            )
                                        }
                                    >
                                        {i18n.t('Edit')}
                                    </Button>
                                )}
                                <Button
                                    small
                                    destructive
                                    onClick={() => {
                                        setAlsoDeleteMetadata(false)
                                        setDeleting({
                                            id: element.id,
                                            name: element.name,
                                        })
                                    }}
                                >
                                    {i18n.t('Remove')}
                                </Button>
                            </div>
                        </div>

                        <div className={styles.chips}>
                            {CHECK_TYPES.filter(
                                (checkType) => element.configs[checkType]
                            ).map((checkType) => (
                                <Tag key={checkType} positive>
                                    {configChipLabel(
                                        checkType,
                                        element.configs[
                                            checkType
                                        ] as PlaceholderConfig
                                    )}
                                </Tag>
                            ))}
                            {element.missing.length > 0 && (
                                <Tooltip
                                    content={element.missing
                                        .map(
                                            (missing) =>
                                                `${missing.type}: ${missing.label} (${missing.id})`
                                        )
                                        .join(', ')}
                                >
                                    <Tag negative>
                                        {element.missing.length === 1
                                            ? i18n.t('⚠ 1 missing metadata')
                                            : i18n.t(
                                                  '⚠ {{total}} missing metadata',
                                                  {
                                                      total: element.missing
                                                          .length,
                                                  }
                                              )}
                                    </Tag>
                                </Tooltip>
                            )}
                        </div>

                        {/* Remount (and thereby collapse) the details when
                            edit mode toggles, so the threshold form below is
                            not pushed out of view by an expanded details
                            section */}
                        <ConfigDetails
                            key={
                                editingId === element.id ? 'editing' : 'viewing'
                            }
                            element={element}
                            ouLevelNames={ouLevelNames}
                        />

                        {editingId === element.id &&
                            element.configs.outliers && (
                                <EditThresholdForm
                                    currentSD={
                                        (element.configs.outliers[
                                            '§VAL_MODZ§'
                                        ] ||
                                            element.configs.outliers[
                                                '§VAL_STDDEV§'
                                            ]) as string
                                    }
                                    method={
                                        element.configs.outliers['§VAL_MODZ§']
                                            ? 'modZ'
                                            : 'sd'
                                    }
                                    busy={busy}
                                    onSave={(newSD) =>
                                        onSaveThreshold(element.id, newSD)
                                    }
                                    onCancel={() => setEditingId(null)}
                                />
                            )}
                    </Panel>
                ))}
            </div>

            {deleting && (
                <Modal position="middle" onClose={() => setDeleting(null)}>
                    <ModalTitle>{i18n.t('Remove configuration')}</ModalTitle>
                    <ModalContent>
                        <p>
                            {i18n.t(
                                "Remove DQ configuration for '{{- name}}'?",
                                {
                                    name: deleting.name,
                                }
                            )}
                        </p>
                        <p>
                            {i18n.t(
                                'The DHIS2 metadata (data elements, predictors, indicators) will not be deleted by default.'
                            )}
                        </p>
                        <Checkbox
                            label={i18n.t(
                                'Also delete the generated DHIS2 metadata (only if unreferenced, unmodified, and owned by this app)'
                            )}
                            checked={alsoDeleteMetadata}
                            onChange={({ checked }) =>
                                setAlsoDeleteMetadata(checked)
                            }
                        />
                    </ModalContent>
                    <ModalActions>
                        <ButtonStrip end>
                            <Button secondary onClick={() => setDeleting(null)}>
                                {i18n.t('Cancel')}
                            </Button>
                            <Button destructive onClick={onConfirmDelete}>
                                {i18n.t('Remove')}
                            </Button>
                        </ButtonStrip>
                    </ModalActions>
                </Modal>
            )}
        </div>
    )
}
