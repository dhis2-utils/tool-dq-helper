import i18n from '@dhis2/d2-i18n'
import React from 'react'
import styles from './InstructionsPage.module.css'
import { Panel } from '@/components/Panel'

export const InstructionsPage = () => (
    <Panel narrow className={styles.content}>
        <h2>{i18n.t('Instructions')}</h2>
        <p>
            {i18n.t(
                'This app helps you set up automated data quality checks for your DHIS2 data elements. It creates three types of quality metrics:'
            )}
        </p>
        <ul>
            <li>
                <strong>{i18n.t('Outliers')}</strong>
                {': '}
                {i18n.t(
                    'Identifies values that deviate significantly from the average'
                )}
            </li>
            <li>
                <strong>{i18n.t('Consistency')}</strong>
                {': '}
                {i18n.t(
                    'Checks if reported values are consistent across periods'
                )}
            </li>
            <li>
                <strong>{i18n.t('Completeness')}</strong>
                {': '}
                {i18n.t('Monitors if data is being reported as expected')}
            </li>
        </ul>
        <h3>{i18n.t('How to use')}</h3>
        <ol>
            <li>
                {i18n.t('Select a data set to filter available data elements')}
            </li>
            <li>
                {i18n.t(
                    'Choose the data element you want to configure quality checks for'
                )}
            </li>
            <li>
                {i18n.t(
                    'For disaggregated data elements, choose how to handle completeness:'
                )}
                <ul>
                    <li>
                        {i18n.t('Use one category option as a proxy for all')}
                    </li>
                    <li>
                        {i18n.t('Count as complete when any category has data')}
                    </li>
                </ul>
            </li>
            <li>
                {i18n.t(
                    'Select the organisation unit level where data is collected'
                )}
            </li>
            <li>
                {i18n.t(
                    'Choose the outlier detection method (modified Z-score or standard deviations from mean) and set its threshold'
                )}
            </li>
            <li>
                {i18n.t(
                    'Click Preview to review the configuration before importing'
                )}
            </li>
        </ol>
    </Panel>
)
