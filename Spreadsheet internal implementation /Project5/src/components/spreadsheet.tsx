import SpreadsheetWs from '../lib/ss-ws.js';
import Cell from './cell.js';
import Clear from './clear.js';
import { Handlers } from './cell.js';
import { Errors } from '../lib/utils.js';
import { Err } from 'cs544-js-utils';

import React from 'react';
import * as ReactDom from 'react-dom/client';

export default function makeSpreadsheet(ws: SpreadsheetWs, ssName: string,
					errors: Errors)
{ 
  const ss = document.querySelector('#ss')!;
  ss.innerHTML = '';
  //ensure new React root for each call to makeSpreadsheet()
  const root = document.createElement('div');
  ss.append(root);
  const spreadsheet = React.createElement(Spreadsheet, {ws, ssName, errors});
  ReactDom.createRoot(root).render(spreadsheet);
}

const [N_ROWS, N_COLS] = [10, 10];

type SpreadsheetProps = {
  ws: SpreadsheetWs;
  ssName: string;
  errors: Errors;
};

type Spreadsheet = { [cellId: string] : { expr: string, value: number } };

export function Spreadsheet(props: SpreadsheetProps) {
  const { ws, ssName, errors } = props;
  const [ ss, setSS ] = React.useState<Spreadsheet>({});
  const [ focusedCellId, setFocusedCellId ] = React.useState('');
  const [ copyCellId, setCopyCellId ] = React.useState('');

  const clearFn = async () => {
    const clearResult = await ws.clear(ssName);
    if (clearResult.isOk) {
      setSS({});
    }
    else {
      errors.display(clearResult.errors);
    }
  };

  const onFocus = (cellId: string) => setFocusedCellId(cellId);

  const onBlur = async (cellId: string, expr: string) => {
    errors.clear();
    setFocusedCellId('');
    const isRemove = (expr.trim().length === 0);
    const result = (isRemove)
      ? await ws.remove(ssName, cellId)
      : await ws.evaluate(ssName, cellId, expr);
    if (result.isOk) {
      const ss1 = applySSUpdates(ss, result.val);
      if (!isRemove) ss1[cellId].expr = expr;
      setSS(ss1);
    }
    else {
      errors.display(result.errors);
    }
  }

  const onCopy = (cellId: string) => setCopyCellId(cellId);

  const onPaste = async (destCellId: string) => {
    errors.clear();
    if (!copyCellId) return;
    const copyResult = await ws.copy(ssName, destCellId, copyCellId);
    const queryResult = await ws.query(ssName, destCellId);
    if (copyResult.isOk && queryResult.isOk) {
      const ss1 = applySSUpdates(ss, copyResult.val);
      ss1[destCellId].expr = queryResult.val.expr;
      setSS(ss1);
      setCopyCellId('');
    }
    else if (!copyResult.isOk) {
      errors.display(copyResult.errors);
    }
    else if (!queryResult.isOk) {
      errors.display(queryResult.errors);
    }
  };

  React.useEffect(() => { 
    errors.clear();
    ws.dumpWithValues(ssName).then(ssLoadResult => {
      if (ssLoadResult.isOk) {
	const spreadsheet =
	  Object.fromEntries(ssLoadResult.val.map(triple => {
	    const [cellId, expr, value] = triple;
	    return [ cellId, { expr, value }];
	  }));
	setSS(spreadsheet);
      }
      else {
	errors.display(ssLoadResult.errors);
      }
    }).catch(err => {
      errors.display([new Err(err, { code: 'UNKNOWN' })]);
    });
  }, [ws, ssName]);

  return render(ss, focusedCellId, copyCellId, clearFn,
		{onFocus, onBlur, onCopy, onPaste});
}

function applySSUpdates(spreadsheet: Spreadsheet,
			updates: { [cellId: string]: number }) {
  const ss = { ...spreadsheet };
  for (const [cellId, value] of Object.entries(updates)) {
    if (!ss[cellId]) {
      //must be destination for a copy operation;
      //will update expr subsequently
      ss[cellId] = { expr: '', value };
    }
    else {
      ss[cellId].value = value;
    }
  }
  return ss;
}

function render(ss: Spreadsheet, focusedCellId: string, copyCellId: string,
		clearFn: () => void, handlers: Handlers)
{ 
  const A = 'A'.charCodeAt(0);
  const hdrs = [];
  for (let i = 0; i < N_COLS; i++) {
    const colHdr = String.fromCharCode(A + i);
    hdrs.push(<th key={colHdr}>{colHdr}</th>);
  }
  const header = <tr><td><Clear clearFn={clearFn}/></td>{hdrs}</tr>;
  const rows = [];
  for (let i = 0; i < N_ROWS; i++) {
    const rowN = (i + 1).toString();
    const cells = [];
    cells.push(<th key={rowN}>{rowN}</th>);
    for (let j = 0; j < N_COLS; j++) {
      const cellId = (String.fromCharCode(A + j) + rowN).toLowerCase();
      const key = cellId;
      const expr = ss[cellId]?.expr ?? '';
      const value = ss[cellId]?.value ?? '';
      const content = (cellId === focusedCellId) ? expr : value.toString();
      const isCopyCell = (cellId === copyCellId);
      const props = { cellId, key, content, isCopyCell, handlers };
      const cell = <Cell {...props}/>;
      cells.push(cell);
    }
    rows.push(<tr key={rowN}>{cells}</tr>);
  }
  return <table><tbody>{header}{rows}</tbody></table>;
}
