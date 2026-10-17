import { DefaultTemplate } from '@payloadcms/next/templates'
import type { AdminViewServerProps } from 'payload'
import { WorksTable } from './WorksTable'

export function WorksTableView(props: AdminViewServerProps) {
  const { req, visibleEntities } = props.initPageResult
  return <DefaultTemplate {...props} req={req} visibleEntities={visibleEntities}>
    {req.user?.collection === 'users' ? <WorksTable /> : <p>请先登录管理员账号。</p>}
  </DefaultTemplate>
}
