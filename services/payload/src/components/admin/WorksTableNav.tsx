'use client'

import Link from 'next/link'
import { useTranslation } from '@payloadcms/ui'

export function WorksTableNav() {
  const { i18n } = useTranslation()
  return <Link className="nav__link" href="/admin/works-table">{i18n.language === 'zh' ? '作品表格' : 'Works table'}</Link>
}
