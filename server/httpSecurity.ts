import { isIP } from 'node:net';
import type { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

export function authRateLimit(limit: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' }
  });
}

export function configureHttpSecurity(app: Express) {
  if (process.env.RENDER === 'true') {
    app.set('trust proxy', 1);
  } else {
    const proxies = (process.env.TRUSTED_PROXY_IPS ?? '').split(',').map((item) => item.trim()).filter(Boolean);
    if (proxies.some((ip) => !isIP(ip))) throw new Error('TRUSTED_PROXY_IPS must contain only IP addresses.');
    if (proxies.length) app.set('trust proxy', proxies);
  }

  if (process.env.NODE_ENV !== 'production') {
    app.disable('x-powered-by');
    app.use(cors());
    return;
  }

  const origins = new Set<string>();
  for (const entry of (process.env.ALLOWED_ORIGINS ?? '').split(',').map((item) => item.trim()).filter(Boolean)) {
    const parsed = new URL(entry);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== entry) {
      throw new Error('ALLOWED_ORIGINS must contain exact HTTP or HTTPS origins.');
    }
    origins.add(parsed.origin);
  }
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", 'https:'],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null
      }
    },
    referrerPolicy: { policy: 'no-referrer' },
    xFrameOptions: { action: 'deny' },
    strictTransportSecurity: process.env.ENABLE_HSTS === 'true'
      ? { maxAge: 31536000, includeSubDomains: false }
      : false
  }));
  app.use('/api', (req, res, next) => {
    const origin = req.get('Origin');
    res.vary('Origin');
    if (!origin || origin === `${req.protocol}://${req.get('Host')}`) return next();
    if (!origins.has(origin)) return res.status(403).json({ error: 'Origin is not allowed.' });
    return cors({ origin })(req, res, next);
  });
}
