import { DefaultTemplate } from '@payloadcms/next/templates'
import type { AdminViewServerProps } from 'payload'
import { WorksTable } from './WorksTable'

export function WorksTableView(props: AdminViewServerProps) {
  const { req, visibleEntities, permissions, locale } = props.initPageResult
  return <DefaultTemplate {...props} req={req} visibleEntities={visibleEntities} permissions={permissions} locale={locale} user={req.user ?? undefined}>
    {req.user?.collection === 'users' ? <WorksTable /> : <p>请先登录管理员账号。</p>}
  </DefaultTemplate>
}
