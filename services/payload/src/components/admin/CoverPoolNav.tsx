'use client'

import Link from 'next/link'
import { useTranslation } from '@payloadcms/ui'

export function CoverPoolNav() {
  const { i18n } = useTranslation()
  return <Link className="nav__link" href="/admin/site-covers">{i18n.language === 'zh' ? '默认封面池' : 'Default covers'}</Link>
}
