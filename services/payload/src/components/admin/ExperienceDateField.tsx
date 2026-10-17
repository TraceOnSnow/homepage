'use client'

import { TextInput, useField } from '@payloadcms/ui'
import type { TextFieldClientProps } from 'payload'
import type { ChangeEvent } from 'react'
import { experienceDateInput } from '@/lib/experience'

export function ExperienceDateField({ path, field, readOnly }: TextFieldClientProps) {
  const { value, setValue, showError } = useField<string>({ path })
  return <TextInput path={path} label={field.label} value={experienceDateInput(value)}
    onChange={(event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value)} readOnly={readOnly} showError={showError}
    placeholder="2020 / 2020-05 / 2020-05-18" description={field.admin?.description} />
}
