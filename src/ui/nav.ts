/** Tab navigation indirection (lets panels switch tabs without import cycles). */
let handler: (id: string) => void = () => {};
export const setNavHandler = (fn: (id: string) => void) => (handler = fn);
export const goTab = (id: string) => handler(id);
