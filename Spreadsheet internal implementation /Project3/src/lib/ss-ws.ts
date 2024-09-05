import cors from 'cors';
import Express from 'express';
import bodyparser from 'body-parser';
import assert from 'assert';
import STATUS from 'http-status';

import { Result, okResult, errResult, Err, ErrResult } from 'cs544-js-utils';

import { SpreadsheetServices as SSServices } from 'cs544-prj2-sol';

import { SelfLink, SuccessEnvelope, ErrorEnvelope }
  from './response-envelopes.js';

export type App = Express.Application;


export function makeApp(ssServices: SSServices, base = '/api')
  : App
{
  const app = Express();
  app.locals.ssServices = ssServices;
  app.locals.base = base;
  setupRoutes(app);
  return app;
}

/******************************** Routing ******************************/

const CORS_OPTIONS = {
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  preflightContinue: false,
  optionsSuccessStatus: 204,
  exposedHeaders: 'Location',
};

function setupRoutes(app: Express.Application) {
  const base = app.locals.base;
  app.use(cors(CORS_OPTIONS));  //will be explained towards end of course
  app.use(Express.json());  //all request bodies parsed as JSON.

  //routes for individual cells
  app.get(`${base}/:ssName/:cellId`, makeCellReadHandler(app));
  app.patch(`${base}/:ssName/:cellId`, makeCellUpdateHandler(app));
  app.delete(`${base}/:ssName/:cellId`, makeCellRemoveHandler(app));

  //routes for entire spreadsheets
  app.delete(`${base}/:ssName`, makeSSClearHandler(app));
  app.put(`${base}/:ssName`, makeSSLoadHandler(app));
  app.get(`${base}/:ssName`, makeSSReadHandler(app));

  //generic handlers: must be last
  app.use(make404Handler(app));
  app.use(makeErrorsHandler(app));
}

/* A handler can be created by calling a function typically structured as
   follows:

   function makeOPHandler(app: Express.Application) {
     return async function(req: Express.Request, res: Express.Response) {
       try {
         const { ROUTE_PARAM1, ... } = req.params; //if needed
         const { QUERY_PARAM1, ... } = req.query;  //if needed
	 VALIDATE_IF_NECESSARY();
	 const SOME_RESULT = await app.locals.ssServices.OP(...);
	 if (!SOME_RESULT.isOk) throw SOME_RESULT;
         res.json(selfResult(req, SOME_RESULT.val));
       }
       catch(err) {
         const mapped = mapResultErrors(err);
         res.status(mapped.status).json(mapped);
       }
     };
   }
*/

/****************** Handlers for Spreadsheet Cells *********************/

function makeCellReadHandler(app: Express.Application) {
  return async function(req: Express.Request, res: Express.Response) {
    try {
      const { ssName, cellId } = req.params;
      const queryResult = await app.locals.ssServices.query(ssName, cellId);
      if (!queryResult.isOk) throw queryResult;
      res.json(selfResult(req, queryResult.val));
    }
    catch(err) {
      const mapped = mapResultErrors(err);
      res.status(mapped.status).json(mapped);
    }
  };
}

type OptionalString = string|undefined;
function makeCellUpdateHandler(app: Express.Application) {
  return async function(req: Express.Request, res: Express.Response) {
    try {
      const { ssName, cellId } = req.params;
      const srcCellId: OptionalString = req.query.srcCellId as OptionalString;
      const expr: OptionalString = req.query.expr as OptionalString;
      const validateResult = validateUpdateParams(srcCellId, expr);
      if (!validateResult.isOk) throw validateResult;
      const updateResult =
	expr
        ? await app.locals.ssServices.evaluate(ssName, cellId, expr)
        : await app.locals.ssServices.copy(ssName, cellId, srcCellId)
      if (!updateResult.isOk) throw updateResult;
      res.json(selfResult(req, updateResult.val));
    }
    catch(err) {
      const mapped = mapResultErrors(err);
      res.status(mapped.status).json(mapped);
    }
  };
}

function validateUpdateParams(srcCellId?: string, expr?: string)
  : Result<undefined> 
{
  const isSrcCellId = !!srcCellId;
  const isExpr = !!expr;
  if (isSrcCellId === isExpr) {
    const msg =
      'exactly one of query parameter srcCellId or expr must be specified';
    return errResult(msg, 'BAD_REQ');
  }
  else {
    return okResult(undefined);
  }
}

function makeCellRemoveHandler(app: Express.Application) {
  return async function(req: Express.Request, res: Express.Response) {
    try {
      const { ssName, cellId } = req.params;
      const removeResult = await app.locals.ssServices.remove(ssName, cellId);
      if (!removeResult.isOk) throw removeResult;
      res.json(selfResult(req, removeResult.val));
    }
    catch(err) {
      const mapped = mapResultErrors(err);
      res.status(mapped.status).json(mapped);
    }
  };
}

/**************** Handlers for Complete Spreadsheets *******************/

function makeSSClearHandler(app: Express.Application) {
  return async function(req: Express.Request, res: Express.Response) {
    try {
      const { ssName } = req.params;
      const clearResult = await app.locals.ssServices.clear(ssName);
      if (!clearResult.isOk) throw clearResult;
      res.json(selfResult(req, clearResult.val));
    }
    catch(err) {
      const mapped = mapResultErrors(err);
      res.status(mapped.status).json(mapped);
    }
  };
}

function makeSSLoadHandler(app: Express.Application) {
  return async function(req: Express.Request, res: Express.Response) {
    try {
      const { ssName } = req.params;
      const data = req.body;
      const loadResult = await app.locals.ssServices.load(ssName, data);
      if (!loadResult.isOk) throw loadResult;
      res.json(selfResult(req, loadResult.val));
    }
    catch(err) {
      const mapped = mapResultErrors(err);
      res.status(mapped.status).json(mapped);
    }
  };
}

function makeSSReadHandler(app: Express.Application) {
  return async function(req: Express.Request, res: Express.Response) {
    try {
      const { ssName } = req.params;
      //doValues added for prj4 (not required for prj3)
      const doValues = !!req.query.doValues;
      const dumpResult =
	await app.locals.ssServices.dump(ssName, doValues);
      if (!dumpResult.isOk) throw dumpResult;
      res.json(selfResult(req, dumpResult.val));
    }
    catch(err) {
      const mapped = mapResultErrors(err);
      res.status(mapped.status).json(mapped);
    }
  };
}

/*************************** Generic Handlers **************************/

/** Default handler for when there is no route for a particular method
 *  and path.
  */
function make404Handler(app: Express.Application) {
  return async function(req: Express.Request, res: Express.Response) {
    const message = `${req.method} not supported for ${req.originalUrl}`;
    const result = {
      status: STATUS.NOT_FOUND,
      errors: [	{ options: { code: 'NOT_FOUND' }, message, }, ],
    };
    res.status(404).json(result);
  };
}


/** Ensures a server error results in nice JSON sent back to client
 *  with details logged on console.
 */ 
function makeErrorsHandler(app: Express.Application) {
  return async function(err: Error, req: Express.Request, res: Express.Response,
			next: Express.NextFunction) {
    const message = err.message ?? err.toString();
    const result = {
      status: STATUS.INTERNAL_SERVER_ERROR,
      errors: [ { options: { code: 'INTERNAL' }, message } ],
    };
    res.status(STATUS.INTERNAL_SERVER_ERROR as number).json(result);
    console.error(result.errors);
  };
}


/************************* HATEOAS Utilities ***************************/

/** Return original URL for req */
function requestUrl(req: Express.Request) {
  return `${req.protocol}://${req.get('host')}${req.originalUrl}`;
}

function selfHref(req: Express.Request, id: string = '') {
  const url = new URL(requestUrl(req));
  return url.pathname + (id ? `/${id}` : url.search);
}

function selfResult<T>(req: Express.Request, result: T,
		       status: number = STATUS.OK)
  : SuccessEnvelope<T>
{
  return { isOk: true,
	   status,
	   links: { self: { href: selfHref(req), method: req.method } },
	   result,
	 };
}


 
/*************************** Mapping Errors ****************************/

//map from domain errors to HTTP status codes.  If not mentioned in
//this map, an unknown error will have HTTP status BAD_REQUEST.
const ERROR_MAP: { [code: string]: number } = {
  EXISTS: STATUS.CONFLICT,
  NOT_FOUND: STATUS.NOT_FOUND,
  BAD_REQ: STATUS.BAD_REQUEST,
  AUTH: STATUS.UNAUTHORIZED,
  DB: STATUS.INTERNAL_SERVER_ERROR,
  INTERNAL: STATUS.INTERNAL_SERVER_ERROR,
}

/** Return first status corresponding to first options.code in
 *  errors, but SERVER_ERROR dominates other statuses.  Returns
 *  BAD_REQUEST if no code found.
 */
function getHttpStatus(errors: Err[]) : number {
  let status: number = 0;
  for (const err of errors) {
    if (err instanceof Err) {
      const code = err?.options?.code;
      const errStatus = (code !== undefined) ? ERROR_MAP[code] : -1;
      if (errStatus > 0 && status === 0) status = errStatus;
      if (errStatus === STATUS.INTERNAL_SERVER_ERROR) status = errStatus;
    }
  }
  return status !== 0 ? status : STATUS.BAD_REQUEST;
}

/** Map domain/internal errors into suitable HTTP errors.  Return'd
 *  object will have a "status" property corresponding to HTTP status
 *  code.
 */
function mapResultErrors(err: Error|ErrResult) : ErrorEnvelope {
  const errors = (err instanceof Error) 
    ? [ new Err(err.message ?? err.toString(), { code: 'UNKNOWN' }), ]
    : err.errors;
  const status = getHttpStatus(errors);
  if (status === STATUS.SERVER_ERROR)  console.error(errors);
  return { isOk: false, status, errors, };
} 

