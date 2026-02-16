(()=>{var a={};a.id=8641,a.ids=[8641],a.modules={261:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/app-paths")},3295:a=>{"use strict";a.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},9608:(a,b,c)=>{"use strict";c.d(b,{nr:()=>h,zF:()=>g});var d=c(48126),e=c(71545);c(81242);let f=new TextEncoder().encode(process.env.JWT_SECRET||"dev-secret-change-me-in-production");async function g(a){return new d.P(a).setProtectedHeader({alg:"HS256"}).setExpirationTime("7d").sign(f)}async function h(a){try{let{payload:b}=await (0,e.V)(a,f);return b}catch{return null}}},10846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},19121:a=>{"use strict";a.exports=require("next/dist/server/app-render/action-async-storage.external.js")},29294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")},44870:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},45897:(a,b,c)=>{"use strict";c.r(b),c.d(b,{handler:()=>E,patchFetch:()=>D,routeModule:()=>z,serverHooks:()=>C,workAsyncStorage:()=>A,workUnitAsyncStorage:()=>B});var d={};c.r(d),c.d(d,{GET:()=>x,POST:()=>y});var e=c(35776),f=c(24085),g=c(29892),h=c(11110),i=c(93292),j=c(261),k=c(74570),l=c(95672),m=c(4120),n=c(69339),o=c(42805),p=c(99991),q=c(82329),r=c(7054),s=c(86439),t=c(39172),u=c(9145),v=c(88634),w=c(9608);async function x(a){if(a.nextUrl.searchParams.get("secret")!==process.env.SETUP_SECRET)return u.NextResponse.json({error:"Forbidden"},{status:403});let b=a.nextUrl.searchParams.get("slug"),c=(0,v.lw)(process.env.DATABASE_URL);try{let a=await c`
      SELECT u.id as user_id, u.email, u.role, c.id as company_id, c.slug
      FROM users u JOIN companies c ON u.company_id = c.id
      WHERE (${b||""} = '' OR c.slug = ${b||""})
      ORDER BY u.created_at ASC LIMIT 1
    `;if(0===a.length)return u.NextResponse.json({error:"No users found"},{status:404});let d=a[0],e=await (0,w.zF)({userId:d.user_id,companyId:d.company_id,role:d.role}),f=await c`
      SELECT id, name, slug, plan
      FROM companies WHERE id = ${d.company_id}
    `,g=await c`
      SELECT id, name, tier, status, droplet_id, droplet_ip, droplet_status, droplet_size,
             container_name, container_host, container_port, created_at
      FROM employees WHERE company_id = ${d.company_id}
      ORDER BY created_at DESC LIMIT 10
    `;return u.NextResponse.json({token:e,user:{id:d.user_id,email:d.email,role:d.role},company:f[0]||null,employees:g})}catch(a){return u.NextResponse.json({error:a.message},{status:500})}}async function y(a){if(a.headers.get("x-setup-secret")!==process.env.SETUP_SECRET)return u.NextResponse.json({error:"Forbidden"},{status:403});let b=(0,v.lw)(process.env.DATABASE_URL);try{return await b`
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        plan VARCHAR(50) NOT NULL DEFAULT 'starter',
        max_employees INTEGER NOT NULL DEFAULT 50,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        settings JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,await b`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'member',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,await b`
      CREATE TABLE IF NOT EXISTS employees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        name VARCHAR(255) NOT NULL,
        job_title VARCHAR(255) NOT NULL,
        template_id VARCHAR(100),
        avatar VARCHAR(500),
        emoji VARCHAR(10) DEFAULT '🤖',
        status VARCHAR(20) NOT NULL DEFAULT 'provisioning',
        container_id VARCHAR(100),
        container_name VARCHAR(255),
        container_host VARCHAR(255),
        container_port INTEGER DEFAULT 18789,
        gateway_token VARCHAR(500),
        model_config JSONB NOT NULL DEFAULT '{"primary": "anthropic/claude-opus-4-6"}',
        persona TEXT,
        goals TEXT,
        tools_config JSONB NOT NULL DEFAULT '{}',
        sandbox_config JSONB NOT NULL DEFAULT '{}',
        email_address VARCHAR(255),
        provisioned_accounts JSONB NOT NULL DEFAULT '{}',
        credentials JSONB NOT NULL DEFAULT '[]',
        config_hash VARCHAR(64),
        last_health_at TIMESTAMPTZ,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,await b`
      CREATE TABLE IF NOT EXISTS employee_skills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        skill_slug VARCHAR(255) NOT NULL,
        source VARCHAR(50) NOT NULL DEFAULT 'clawhub',
        enabled BOOLEAN NOT NULL DEFAULT true,
        config JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(employee_id, skill_slug)
      )
    `,await b`
      CREATE TABLE IF NOT EXISTS channel_connections (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        channel_type VARCHAR(50) NOT NULL,
        name VARCHAR(255) NOT NULL,
        credentials JSONB NOT NULL DEFAULT '{}',
        config JSONB NOT NULL DEFAULT '{}',
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,await b`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id),
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        mode VARCHAR(20),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,await b`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_employee_id ON chat_messages(employee_id, created_at DESC)
    `,await b`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        user_id UUID REFERENCES users(id),
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(50) NOT NULL,
        resource_id UUID NOT NULL,
        details JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,await b`
      CREATE TABLE IF NOT EXISTS usage_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL REFERENCES companies(id),
        employee_id UUID REFERENCES employees(id),
        metric VARCHAR(50) NOT NULL,
        value BIGINT NOT NULL,
        period_start TIMESTAMPTZ NOT NULL,
        period_end TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,await b`
      CREATE TABLE IF NOT EXISTS triggers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        company_id UUID NOT NULL REFERENCES companies(id),
        type VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        config JSONB NOT NULL DEFAULT '{}',
        enabled BOOLEAN NOT NULL DEFAULT true,
        webhook_token VARCHAR(100),
        last_run_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,await b`
      CREATE INDEX IF NOT EXISTS idx_triggers_employee_id ON triggers(employee_id)
    `,await b`
      CREATE INDEX IF NOT EXISTS idx_triggers_webhook_token ON triggers(webhook_token) WHERE webhook_token IS NOT NULL
    `,await b`ALTER TABLE employees ADD COLUMN IF NOT EXISTS credentials JSONB NOT NULL DEFAULT '[]'`,await b`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_id VARCHAR(50)`,await b`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_ip VARCHAR(45)`,await b`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_region VARCHAR(20) DEFAULT 'nyc3'`,await b`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_size VARCHAR(50) DEFAULT 's-2vcpu-4gb'`,await b`ALTER TABLE companies ADD COLUMN IF NOT EXISTS droplet_status VARCHAR(20) DEFAULT 'none'`,await b`ALTER TABLE companies ADD COLUMN IF NOT EXISTS interservice_secret VARCHAR(255)`,await b`UPDATE companies SET max_employees = 50 WHERE max_employees < 50`,await b`ALTER TABLE employees ADD COLUMN IF NOT EXISTS personality_config JSONB NOT NULL DEFAULT '{"autonomy": "high", "proactivity": "proactive", "communication": "concise"}'`,await b`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        company_id UUID NOT NULL REFERENCES companies(id),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        priority VARCHAR(20) NOT NULL DEFAULT 'medium',
        source VARCHAR(20) NOT NULL DEFAULT 'manager',
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `,await b`
      CREATE TABLE IF NOT EXISTS shared_infrastructure (
        key VARCHAR(50) PRIMARY KEY DEFAULT 'default',
        droplet_id VARCHAR(50),
        droplet_ip VARCHAR(45),
        droplet_region VARCHAR(20) DEFAULT 'nyc3',
        droplet_size VARCHAR(50) DEFAULT 's-4vcpu-8gb',
        droplet_status VARCHAR(20) DEFAULT 'none',
        interservice_secret VARCHAR(255),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,await b`INSERT INTO shared_infrastructure (key) VALUES ('default') ON CONFLICT DO NOTHING`,await b`ALTER TABLE employees ADD COLUMN IF NOT EXISTS tier VARCHAR(20) NOT NULL DEFAULT 'junior'`,await b`ALTER TABLE employees ADD COLUMN IF NOT EXISTS droplet_id VARCHAR(50)`,await b`ALTER TABLE employees ADD COLUMN IF NOT EXISTS droplet_ip VARCHAR(45)`,await b`ALTER TABLE employees ADD COLUMN IF NOT EXISTS droplet_region VARCHAR(20) DEFAULT 'nyc3'`,await b`ALTER TABLE employees ADD COLUMN IF NOT EXISTS droplet_size VARCHAR(50)`,await b`ALTER TABLE employees ADD COLUMN IF NOT EXISTS droplet_status VARCHAR(20) DEFAULT 'none'`,await b`ALTER TABLE employees ADD COLUMN IF NOT EXISTS interservice_secret VARCHAR(255)`,await b`ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20)`,u.NextResponse.json({success:!0,message:"All tables created"})}catch(a){return console.error("Setup error:",a),u.NextResponse.json({error:a.message},{status:500})}}let z=new e.AppRouteRouteModule({definition:{kind:f.RouteKind.APP_ROUTE,page:"/api/setup/route",pathname:"/api/setup",filename:"route",bundlePath:"app/api/setup/route"},distDir:".next",relativeProjectDir:"",resolvedPagePath:"/home/user/ai-employees/apps/web/src/app/api/setup/route.ts",nextConfigOutput:"",userland:d}),{workAsyncStorage:A,workUnitAsyncStorage:B,serverHooks:C}=z;function D(){return(0,g.patchFetch)({workAsyncStorage:A,workUnitAsyncStorage:B})}async function E(a,b,c){var d;let e="/api/setup/route";"/index"===e&&(e="/");let g=await z.prepare(a,b,{srcPage:e,multiZoneDraftMode:!1});if(!g)return b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve()),null;let{buildId:u,params:v,nextConfig:w,isDraftMode:x,prerenderManifest:y,routerServerContext:A,isOnDemandRevalidate:B,revalidateOnlyGenerated:C,resolvedPathname:D}=g,E=(0,j.normalizeAppPath)(e),F=!!(y.dynamicRoutes[E]||y.routes[D]);if(F&&!x){let a=!!y.routes[D],b=y.dynamicRoutes[E];if(b&&!1===b.fallback&&!a)throw new s.NoFallbackError}let G=null;!F||z.isDev||x||(G="/index"===(G=D)?"/":G);let H=!0===z.isDev||!F,I=F&&!H,J=a.method||"GET",K=(0,i.getTracer)(),L=K.getActiveScopeSpan(),M={params:v,prerenderManifest:y,renderOpts:{experimental:{cacheComponents:!!w.experimental.cacheComponents,authInterrupts:!!w.experimental.authInterrupts},supportsDynamicResponse:H,incrementalCache:(0,h.getRequestMeta)(a,"incrementalCache"),cacheLifeProfiles:null==(d=w.experimental)?void 0:d.cacheLife,isRevalidate:I,waitUntil:c.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:void 0,onInstrumentationRequestError:(b,c,d)=>z.onRequestError(a,b,d,A)},sharedContext:{buildId:u}},N=new k.NodeNextRequest(a),O=new k.NodeNextResponse(b),P=l.NextRequestAdapter.fromNodeNextRequest(N,(0,l.signalFromNodeResponse)(b));try{let d=async c=>z.handle(P,M).finally(()=>{if(!c)return;c.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let d=K.getRootSpanAttributes();if(!d)return;if(d.get("next.span_type")!==m.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${d.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=d.get("next.route");if(e){let a=`${J} ${e}`;c.setAttributes({"next.route":e,"http.route":e,"next.span_name":a}),c.updateName(a)}else c.updateName(`${J} ${a.url}`)}),g=async g=>{var i,j;let k=async({previousCacheEntry:f})=>{try{if(!(0,h.getRequestMeta)(a,"minimalMode")&&B&&C&&!f)return b.statusCode=404,b.setHeader("x-nextjs-cache","REVALIDATED"),b.end("This page could not be found"),null;let e=await d(g);a.fetchMetrics=M.renderOpts.fetchMetrics;let i=M.renderOpts.pendingWaitUntil;i&&c.waitUntil&&(c.waitUntil(i),i=void 0);let j=M.renderOpts.collectedTags;if(!F)return await (0,o.I)(N,O,e,M.renderOpts.pendingWaitUntil),null;{let a=await e.blob(),b=(0,p.toNodeOutgoingHttpHeaders)(e.headers);j&&(b[r.NEXT_CACHE_TAGS_HEADER]=j),!b["content-type"]&&a.type&&(b["content-type"]=a.type);let c=void 0!==M.renderOpts.collectedRevalidate&&!(M.renderOpts.collectedRevalidate>=r.INFINITE_CACHE)&&M.renderOpts.collectedRevalidate,d=void 0===M.renderOpts.collectedExpire||M.renderOpts.collectedExpire>=r.INFINITE_CACHE?void 0:M.renderOpts.collectedExpire;return{value:{kind:t.CachedRouteKind.APP_ROUTE,status:e.status,body:Buffer.from(await a.arrayBuffer()),headers:b},cacheControl:{revalidate:c,expire:d}}}}catch(b){throw(null==f?void 0:f.isStale)&&await z.onRequestError(a,b,{routerKind:"App Router",routePath:e,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:B})},A),b}},l=await z.handleResponse({req:a,nextConfig:w,cacheKey:G,routeKind:f.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:y,isRoutePPREnabled:!1,isOnDemandRevalidate:B,revalidateOnlyGenerated:C,responseGenerator:k,waitUntil:c.waitUntil});if(!F)return null;if((null==l||null==(i=l.value)?void 0:i.kind)!==t.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(j=l.value)?void 0:j.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});(0,h.getRequestMeta)(a,"minimalMode")||b.setHeader("x-nextjs-cache",B?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),x&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return(0,h.getRequestMeta)(a,"minimalMode")&&F||m.delete(r.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||b.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,q.getCacheControlHeader)(l.cacheControl)),await (0,o.I)(N,O,new Response(l.value.body,{headers:m,status:l.value.status||200})),null};L?await g(L):await K.withPropagatedContext(a.headers,()=>K.trace(m.BaseServerSpan.handleRequest,{spanName:`${J} ${a.url}`,kind:i.SpanKind.SERVER,attributes:{"http.method":J,"http.target":a.url}},g))}catch(b){if(b instanceof s.NoFallbackError||await z.onRequestError(a,b,{routerKind:"App Router",routePath:E,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:B})}),F)throw b;return await (0,o.I)(N,O,new Response(null,{status:500})),null}}},53139:()=>{},63033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},86439:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external")},90091:()=>{}};var b=require("../../../webpack-runtime.js");b.C(a);var c=b.X(0,[7955,6872,8634,3815],()=>b(b.s=45897));module.exports=c})();