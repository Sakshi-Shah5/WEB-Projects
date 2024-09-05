import React from 'react';


import SpreadsheetWs from '../lib/ss-ws.js';

type CellProps = {
  cellId: string;
  content: string;
  isCopyCell: boolean;
  handlers: Handlers;
};

type Handler = (cellId: string, content?: string) => void;
export type Handlers = {
  onFocus: Handler;
  onBlur: Handler;
  onCopy: Handler;
  onPaste: Handler;
};

export default function Cell(props: CellProps) {
  const { cellId, isCopyCell, content, handlers } = props;
  const [ cellContent, setCellContent ] = React.useState(content);
  const [ isFocused, setIsFocused ] = React.useState(false);
  React.useEffect(() => setCellContent(content), [content]);
  const klass = (isCopyCell)  ? 'is-copy-source' : '';
  return (
    <td className={klass}>
      <input value={cellContent} id={cellId} data-is-focused={isFocused}
         onBlur={(ev) => {
	   setIsFocused(false);
	   handlers.onBlur(cellId, cellContent);
	   setCellContent(content);
	 }}
         onChange={(ev) => setCellContent(ev.target.value)}
         onFocus={() => { setIsFocused(true); handlers.onFocus(cellId);}}
         onCopy={(ev) => { ev.preventDefault(); handlers.onCopy(cellId); }}
         onPaste={(ev) => { ev.preventDefault(); handlers.onPaste(cellId); }}/>
    </td>
  );
}

