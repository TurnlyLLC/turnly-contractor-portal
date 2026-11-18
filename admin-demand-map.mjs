import {renderStandaloneAdminSidebar,bindStandaloneAdminNavigation} from './admin-navigation.mjs?v=20261115-mobile-fixes';
import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';
import {mountDemandMap} from './demand-map.mjs?v=20261118-city-only';
document.getElementById('adminNavigation').outerHTML=renderStandaloneAdminSidebar('demand-map');bindStandaloneAdminNavigation();
const env=window.__ENV||{},client=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY);
await mountDemandMap(document.getElementById('demandMap'),{dataset:'city_demand',request:async values=>{const {data}=await client.auth.getSession();if(!data.session)throw Error('Sign in to the admin portal to view this map.');const r=await fetch('/api/admin-map',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(values)});const result=await r.json();if(!r.ok)throw Error(result.error||'Unable to load map.');return result;}});
