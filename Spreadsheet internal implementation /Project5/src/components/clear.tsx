import React from 'react';

export default function Clear(props: { clearFn: () => void }) {
  const { clearFn } = props;
  return <>
    <button onClick={clearFn} id="clear">Clear</button>
  </>;
}
