import {notFound} from 'next/navigation';
import {LMS_ENABLED} from '@/lib/lms-flags';
import TenantAdminWorkspace from './workspace';
export default async function TenantAdminPage({params}:{params:Promise<{tenantId:string}>}){
 const {tenantId}=await params;
 if(!LMS_ENABLED||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId))notFound();
 return <TenantAdminWorkspace tenantId={tenantId}/>;
}
