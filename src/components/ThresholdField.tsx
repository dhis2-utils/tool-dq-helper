import i18n from '@dhis2/d2-i18n'
import { InputField } from '@dhis2/ui'
import React from 'react'

export type OutlierMethod = 'modZ' | 'sd'

// Sensible bounds per method: k standard deviations vs modified-Z cutoff
const RANGE: Record<OutlierMethod, { min: number; max: number }> = {
    sd: { min: 2, max: 4 },
    modZ: { min: 2.5, max: 5 },
}

export const defaultThreshold = (method: OutlierMethod): string =>
    method === 'modZ' ? '3.5' : '3.0'

export const isValidThreshold = (
    value: string,
    method: OutlierMethod = 'sd'
): boolean => {
    const { min, max } = RANGE[method]
    return (
        Boolean(value) && parseFloat(value) >= min && parseFloat(value) <= max
    )
}

/** Number input for the outlier threshold value (k), with validation. */
export const ThresholdField = ({
    label,
    method = 'sd',
    value,
    onChange,
}: {
    label: string
    method?: OutlierMethod
    value: string
    onChange: (value: string) => void
}) => {
    const { min, max } = RANGE[method]
    const showError = Boolean(value) && !isValidThreshold(value, method)
    return (
        <InputField
            label={label}
            type="number"
            min={String(min)}
            max={String(max)}
            step="0.1"
            value={value}
            error={showError}
            validationText={
                showError
                    ? i18n.t('Threshold must be between {{min}} and {{max}}.', {
                          min,
                          max,
                      })
                    : undefined
            }
            onChange={({ value: newValue }) => onChange(newValue || '')}
        />
    )
}
