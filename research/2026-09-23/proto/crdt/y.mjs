import * as Y from "yjs"; const d=new Y.Doc(); const m=d.getMap("w"); m.set("a",1); console.log(Y.encodeStateAsUpdate(d).length)
