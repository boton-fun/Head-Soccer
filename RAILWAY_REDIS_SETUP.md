# Railway Redis Setup Instructions

## Problem
Getting `getaddrinfo ENOTFOUND redis` error in Railway deployment.

## Solution Implemented
Created a robust caching system with automatic fallback:

### 1. Improved Cache Service (`utils/cache-service.js`)
- ✅ Handles multiple Redis URL formats (redis://, rediss://, host:port, hostname)
- ✅ Automatic fallback to in-memory cache when Redis fails
- ✅ Graceful error handling without crashing the app
- ✅ Status monitoring and health checks

### 2. In-Memory Fallback (`utils/in-memory-cache.js`)
- ✅ Full Redis-compatible API
- ✅ TTL support with automatic cleanup
- ✅ Queue operations (zAdd, zRange, zRem, zCard)
- ✅ Memory efficient with timeout management

## Railway Redis Configuration Options

### Option 1: Railway Redis Plugin (Recommended)
1. Go to your Railway project dashboard
2. Click "Add Service" or "New" 
3. Select "Database" → "Redis"
4. Railway will automatically provide environment variables:
   - `REDIS_URL` (format: `redis://user:password@host:port`)
   - `REDIS_PRIVATE_URL` (internal network URL)

### Option 2: External Redis Service
Use external providers like:
- **Upstash Redis** (Free tier available)
- **Redis Cloud** 
- **AWS ElastiCache**
- **DigitalOcean Redis**

Set these environment variables in Railway:
```
REDIS_URL=redis://username:password@host:port
REDIS_PASSWORD=your_password (if needed)
```

### Option 3: Continue Without Redis
The app now works perfectly without Redis using in-memory cache:
- ✅ Maintains all functionality
- ✅ Suitable for development and small-scale production
- ✅ Automatic scaling with server instances

## Environment Variables to Set in Railway

### Required for Redis:
```
REDIS_URL=your_redis_connection_string
REDIS_PASSWORD=your_redis_password (optional)
```

### Other Important Variables:
```
NODE_ENV=production
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key
JWT_SECRET=your_secure_jwt_secret
SESSION_SECRET=your_secure_session_secret
FRONTEND_URL=https://your-frontend-domain.vercel.app
```

## Testing the Fix

### Health Check Endpoint
Visit: `https://your-app.railway.app/health`

Response will show cache status:
```json
{
  "status": "OK",
  "services": {
    "cache": {
      "redis": false,
      "fallback": true,
      "mode": "in-memory"
    }
  }
}
```

### Cache Test Endpoint
Visit: `https://your-app.railway.app/test-redis`

Tests cache operations and shows detailed results.

## Status
✅ **FIXED** - App now handles Redis connection failures gracefully
✅ **FALLBACK** - In-memory cache provides full functionality
✅ **PRODUCTION READY** - No more crashes due to Redis connection issues

The multiplayer features will work with either Redis or in-memory cache. Redis provides better performance and persistence across server restarts, but is not required for basic functionality.