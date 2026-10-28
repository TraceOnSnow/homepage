import { DefaultTemplate } from '@payloadcms/next/templates'
import type { AdminViewServerProps } from 'payload'
import { CoverPool } from './CoverPool'

export function CoverPoolView(props: AdminViewServerProps) {
  const { req, visibleEntities, permissions, locale } = props.initPageResult
  return <DefaultTemplate {...props} req={req} visibleEntities={visibleEntities} permissions={permissions} locale={locale} user={req.user ?? undefined}>
    {req.user?.collection === 'users' ? <CoverPool /> : <p>请先登录管理员账号。</p>}
  </DefaultTemplate>
}
