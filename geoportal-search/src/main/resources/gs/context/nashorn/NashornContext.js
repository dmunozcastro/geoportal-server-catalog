/* See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * Esri Inc. licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

(function(){
  
  if (typeof console === "undefined") {
    console = {};
    console.debug = print;
    console.log = print;
    console.warn = print;
    console.error = print;
  }
  
  gs._jvmTypes = {
    CharArray: Java.type("char[]")
  };
  
  /* ============================================================================================== */
  
  gs.context.nashorn.NashornContext = gs.Object.create(gs.context.Context,{
  
    indentXml: {value: function(task,xml) {
      return gs.context.nashornUtil.indentXml(xml);
    }},
    
    newCounter: {value: function() {
      return new Packages.java.util.concurrent.atomic.AtomicInteger();
    }},
    
    newStringBuilder: {value: function() {
      return gs.Object.create(gs.context.nashorn.StringBuilder).init();
    }},
    
    newXmlInfo: {value: function(task,xmlString,nsmap) {
      var source = new org.xml.sax.InputSource(new java.io.StringReader(xmlString));
      var factory = javax.xml.parsers.DocumentBuilderFactory.newInstance();
      factory.setNamespaceAware(true);
      factory.setExpandEntityReferences(false);
      factory.setFeature("http://javax.xml.XMLConstants/feature/secure-processing",true);
      //factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true); 
      var builder = factory.newDocumentBuilder();
      var dom = builder.parse(source);
      var root = dom.getDocumentElement();
      var xpathEvaluator = gs.context.nashornUtil.newXPathEvaluator(nsmap);
      var xmlInfo = {
        dom: dom,
        root: root,
        xpathEvaluator: xpathEvaluator
      };
      return xmlInfo;
    }},
    
    readResourceFile: {value: function(path,charset) {
      return gs.context.nashornUtil.readResourceFile(path,charset);
    }},
  
    removeAllButFilter: {value: function(xml) {
      return gs.context.nashornUtil.removeAllButFilter(xml);
    }},
  
    sendHttpRequest: {value: function(task,url,data,dataContentType) {
      var result, promise = this.newPromise();
      try {
        if (task.async) {
          new java.lang.Thread(function() {
            try {
              if (task.verbose) console.warn("NashornContext sendHttpRequest.async");
              result = gs.context.nashornUtil.sendHttpRequest(url,data,dataContentType);
              if (task.verbose) console.warn("NashornContext sendHttpRequest.async resolved",url);
              //print(typeof result, result.length);
              promise.resolve(result);
            } catch(err2) {
              promise.reject(err2);
            }
          }).start();
        } else {
          result = gs.context.nashornUtil.sendHttpRequest(url,data,dataContentType);
          promise.resolve(result);
        }
      } catch (err) {
        promise.reject(err);
      }    
      return promise;
    }}
  
  });
  
  /* ============================================================================================== */
  
  gs.context.nashornUtil = {
    
    indentXml: function(xml) {
      // TODO removeBOM ??
      var header = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>";
      if (xml !== null) xml = xml.trim();
      if (xml === null || xml.length === 0) throw new Error("Empty XML.");
      var source = new javax.xml.transform.stream.StreamSource(new java.io.StringReader(xml));
      var streamResult = new javax.xml.transform.stream.StreamResult(new java.io.StringWriter());
      this.transform(source,streamResult,true);
      var v = streamResult.getWriter().toString();
      if (v !== null) {
        v = v.trim();
        if (v.startsWith(header+"<")) v = v.replace(header,header+"\r\n");
        if (v.length === 0) v = null;
      };
      return v;
    },
    
    newXPathEvaluator: function(nsmap) {
      var key;
      var createFunc = function(value) {
        if (typeof value === "function") return value;
        return function() {return value};
      };
      var iface = function(map) {
        var ifaceImpl = {};
        for (key in map) {
          ifaceImpl[key] = createFunc(map[key]);
        }
        return ifaceImpl;
      };
      
      //var nsContext = new gs._jvmTypes.NamespaceContext(iface({
      var nsContext = new javax.xml.namespace.NamespaceContext(iface({
        getNamespaceURI: function(prefix) {
          //console.log("getNamespaceURI",prefix);
          if (nsmap) return nsmap[prefix];
        },
        getPrefix: function(uri) {
          //console.log("getPrefix",uri);
          if (nsmap) {
            for (key in nsmap) {
              if (nsmap[key] === uri) return key;
            }
          }
          return null;
        },
        getPrefixes: function(uri) {
          //console.log("getPrefixes",uri);
          return null;
        }
      }));
      
      var xpath = javax.xml.xpath.XPathFactory.newInstance().newXPath();
      xpath.setNamespaceContext(nsContext);
      
      var NODETYPE_ATTRIBUTE = org.w3c.dom.Node.ATTRIBUTE_NODE;
      var NODETYPE_ELEMENT = org.w3c.dom.Node.ELEMENT_NODE;
      var NODETYPE_TEXT = org.w3c.dom.Node.TEXT_NODE;
      var XPATH_NODE = javax.xml.xpath.XPathConstants.NODE;
      var XPATH_NODESET = javax.xml.xpath.XPathConstants.NODESET;
      var XPATH_STRING = javax.xml.xpath.XPathConstants.STRING;
      
      var evaluator = {
        forEachChild: function(node,callback) {
          var r, self = this;
          this.getChildren(node).forEach(function(child){
            if (callback) {
              r =callback({
                node: child,
                nodeInfo: self.getNodeInfo(child),
                nodeText: self.getNodeText(child)
              });
              if (r === "break") return;
            }
          });
        },
        getNode: function(contextNode,xpathExpression) {
          return xpath.evaluate(xpathExpression,contextNode,XPATH_NODE);
        },
        getNodes: function(contextNode,xpathExpression) {
          var nl = xpath.evaluate(xpathExpression,contextNode,XPATH_NODESET);
          return this._nodeListToArray(nl);
        },
        getString: function(contextNode,xpathExpression) {
          return xpath.evaluate(xpathExpression,contextNode,XPATH_STRING);
        },
        
        getAttributes: function(node) {
          if (node) {
            return this._nodeListToArray(node.getAtrtibutes());
          }
          return [];
        },
        getChildren: function(node) {
          if (node) {
            return this._nodeListToArray(node.getChildNodes());
          }
          return [];
        },
        getNodeInfo: function(node) {
          var info = {
            node: node,
            nodeName: node.getNodeName(),
            localName: node.getLocalName(),
            namespaceURI: node.getNamespaceURI(),
            isAttributeNode: node.getNodeType() === NODETYPE_ATTRIBUTE,
            isElementNode: node.getNodeType() === NODETYPE_ELEMENT,
            isTextNode: node.getNodeType() === NODETYPE_TEXT
          };
          return info;
        },
        getNodeText: function(node) {
          var v;
          if (node) {
            if (node.getNodeType() === 1) {
              v = node.getTextContent();
              if (typeof v === "string") v = v.trim();
            } else {
              v = node.getNodeValue();
            }
            if (typeof v === "string") {
              return v;
            }
          }
          return null;
        },
        _nodeListToArray: function(nl) {
          var i, a = [];
          if (nl) {
            for (i = 0; i < nl.getLength(); i++) {
              a.push(nl.item(i));
            }
          }
          return a;
        }
      };
      return evaluator;
    },
    
    readResourceFile: function(path,charset) {
      if (charset === null || charset.length == 0) charset = "UTF-8";
      var url = java.lang.Thread.currentThread().getContextClassLoader().getResource(path);
      var content = new java.lang.String(java.nio.file.Files.readAllBytes(
        java.nio.file.Paths.get(url.toURI())),charset);
      return content;
    },
    
    removeAllButFilter: function(xml) {
      // TODO removeBOM ?? 
      try {
        var inputSource = new org.xml.sax.InputSource(new java.io.StringReader(xml));
        var factory = javax.xml.parsers.DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setExpandEntityReferences(false);
        factory.setFeature("http://javax.xml.XMLConstants/feature/secure-processing",true);
        //factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
        var builder = factory.newDocumentBuilder();
        var dom = builder.parse(inputSource);
  
        var root = dom.getDocumentElement();
        var nl = root.getChildNodes();
        for (var i=0;i<nl.getLength();i++) {
          var nd = nl.item(i);
          if (nd.getNodeType() == org.w3c.dom.Node.ELEMENT_NODE) {
            if (nd.getLocalName() !== "Filter_Capabilities") {
              root.removeChild(nd);
            }
          } else if (nd.getNodeType() == org.w3c.dom.Node.COMMENT_NODE) {
            root.removeChild(nd);
          } else if (nd.getNodeType() == org.w3c.dom.Node.TEXT_NODE) {
          }
        }
        
        var source = new javax.xml.transform.dom.DOMSource(dom);
        var streamResult = new javax.xml.transform.stream.StreamResult(new java.io.StringWriter());
        this.transform(source,streamResult,true);
        var result = streamResult.getWriter().toString();
        return result;
      } catch(e) {
        return xml;
      }
    },
    
    sendHttpRequest: function(url, data, dataContentType) {
      var result = null;
      var br = null, wr = null;
      var sw = new java.io.StringWriter();
      try {
        var u = new java.net.URL(url);
        //print(u);
        java.net.HttpURLConnection.setFollowRedirects(true);
        var con = u.openConnection();
        con.setInstanceFollowRedirects(true);
        if (typeof data === "string" && data.length > 0) {
          con.setDoOutput(true);
          con.setRequestMethod("POST");
          var postData = data.getBytes("UTF-8");
          if (typeof dataContentType === "string" && dataContentType.length > 0) {
            con.setRequestProperty( "Content-Type",dataContentType);
          }
          con.setRequestProperty("charset","UTF-8");
          con.setRequestProperty("Content-Length",""+postData.length);
          wr = new java.io.DataOutputStream(con.getOutputStream());
          wr.write(postData);
        }
        var charset = "UTF-8";
        var contentType = con.getContentType();
        if (contentType !== null) {
          var a = contentType.split(";");
          a.some(function(v){
            v = v.trim();
            if (v.toLowerCase().startsWith("charset=")) {
              var cs = v.substring("charset=".length).trim();
              if (cs.length() > 0) {
                charset = cs;
                return true;
              }
            }
          });
        }
        //print("contentType="+contentType+" ... charset="+charset);
        br = new java.io.BufferedReader(new java.io.InputStreamReader(con.getInputStream(),charset));
        var nRead = 0;;
        var buffer = new gs._jvmTypes.CharArray(4096);
        while ((nRead = br.read(buffer,0,4096)) >= 0) {
          sw.write(buffer,0,nRead); // TODO comment out this line and Invalid JSON: <json>:1:0 Expected json literal but found eof
        }
        result = sw.toString();
        //console.log("result",result);
      } catch(e) {
        print(e); // TODO printStackTrace
      } finally{
        try {if (wr !== null) wr.close();} catch(ef) {print(ef);}
        try {if (br !== null) br.close();} catch(ef) {print(ef);}
      }
      return result;
    },
    
    transform: function(source,result,indent) {
      var factory = javax.xml.transform.TransformerFactory.newInstance();
      factory.setAttribute(javax.xml.XMLConstants.ACCESS_EXTERNAL_DTD,"");
      factory.setFeature("http://javax.xml.XMLConstants/feature/secure-processing",true);
      //factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
      var transformer = factory.newTransformer();
      transformer.setOutputProperty(javax.xml.transform.OutputKeys.ENCODING,"UTF-8");
      transformer.setOutputProperty(javax.xml.transform.OutputKeys.METHOD,"xml");
      if (indent) {
        transformer.setOutputProperty(javax.xml.transform.OutputKeys.INDENT,"yes");
        transformer.setOutputProperty("{http://xml.apache.org/xslt}indent-amount","2");
      }
      transformer.transform(source,result);
    }
    
  };
  
  /* ============================================================================================== */

}());
