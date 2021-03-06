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
package com.esri.geoportal.lib.elastic;
import com.carrotsearch.hppc.cursors.ObjectObjectCursor;
import com.esri.geoportal.base.util.JsonUtil;
import com.esri.geoportal.base.util.Val;

import java.net.InetAddress;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Timer;
import java.util.TimerTask;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import javax.json.JsonObject;

import org.elasticsearch.client.AdminClient;
import org.elasticsearch.client.transport.TransportClient;
import org.elasticsearch.common.collect.ImmutableOpenMap;
import org.elasticsearch.common.settings.Settings;
import org.elasticsearch.common.transport.InetSocketTransportAddress;
import org.elasticsearch.transport.client.PreBuiltTransportClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Elasticsearch context.
 */
public class ElasticContext {

  /** Logger. */
  private static final Logger LOGGER = LoggerFactory.getLogger(ElasticContext.class);
  
  /** Instance variables . */
  private boolean allowFileId;
  private boolean autoCreateIndex;
  private String clusterName = null;
  private int httpPort = 9200;
  private String indexName = "metadata";
  private boolean indexNameIsAlias = true;
  private String itemIndexType = "item";
  private String mappingsFile = "config/elastic-mappings.json";
  private List<String> nodes;
  private TransportClient transportClient;
  private int transportPort = 9300;
  private String xmlIndexType = "clob";
  
  /** Constructor */
  public ElasticContext() {}
  
  /** Allow internal metadata file idenitfiers to be used as the Elasticsearch _id .*/
  public boolean getAllowFileId() {
    return allowFileId;
  }
  /** Allow internal metadata file idenitfiers to be used as the Elasticsearch _id .*/
  public void setAllowFileId(boolean allowFileId) {
    this.allowFileId = allowFileId;
  }

  /** Auto-create the metadata index if required. */
  public boolean getAutoCreateIndex() {
    return autoCreateIndex;
  }
  /** Auto-create the metadata index if required. */
  public void setAutoCreateIndex(boolean autoCreateIndex) {
    this.autoCreateIndex = autoCreateIndex;
  }
  
  /** The cluster name. */
  public String getClusterName() {
    return clusterName;
  }
  /** The cluster name. */
  public void setClusterName(String clusterName) {
    this.clusterName = clusterName;
  }
  
  /** The HTTP port (default=9200) */
  public int getHttpPort() {
    return httpPort;
  }
  /** The HTTP port (default=9200) */
  public void setHttpPort(int httpPort) {
    this.httpPort = httpPort;
  }

  /** The metadata index name (default=metadata). */
  public String getIndexName() {
    return this.indexName;
  }
  /** The metadata index name (default=metadata). */
  public void setIndexName(String indexName) {
    this.indexName = indexName;
  }

  /** Treat the index name as an alias. */
  public boolean getIndexNameIsAlias() {
    return indexNameIsAlias;
  }
  /** Treat the index name as an alias. */
  public void setIndexNameIsAlias(boolean indexNameIsAlias) {
    this.indexNameIsAlias = indexNameIsAlias;
  }
  
  /** The index name holding metadata items. */
  public String getItemIndexName() {
    return this.indexName;
  }

  /** The item index type (default=item). */
  public String getItemIndexType() {
    return this.itemIndexType;
  }
  /** The item index type (default=item). */
  @SuppressWarnings("unused")
  private void setItemIndexType(String itemIndexType) {
    this.itemIndexType = itemIndexType;
  }
  
  /** The index mappings file (default=config/elastic-mappings.json). */
  public String getMappingsFile() {
    return mappingsFile;
  }
  /** The index mappings file (default=config/elastic-mappings.json). */
  public void setMappingsFile(String mappingsFile) {
    this.mappingsFile = mappingsFile;
  }

  /** The node names. */
  public List<String> getNodes() {
    return this.nodes;
  }
  /** The node names. */
  public void setNodes(List<String> nodes) {
    this.nodes = nodes;
  }
  
  /** The transport client. */
  public TransportClient getTransportClient() {
    return transportClient;
  }
  /** The transport client. */
  public void setTransportClient(TransportClient transportClient) {
    this.transportClient = transportClient;
  }
  
  /** The transport port (default=9300) */
  public int getTransportPort() {
    return transportPort;
  }
  /** The transport port (default=9300) */
  public void setTransportPort(int transportPort) {
    this.transportPort = transportPort;
  }

  /** The index name holding metadata xmls. */
  public String getXmlIndexName() {
    return this.indexName;
  }
  
  /** The xml index type (default=xml). */
  public String getXmlIndexType() {
    return xmlIndexType;
  }
  /** The xml index type (default=xml). */
  @SuppressWarnings("unused")
  private void setXmlIndexType(String xmlIndexType) {
    this.xmlIndexType = xmlIndexType;
  }
  
  /** Methods =============================================================== */
  
  /**
   * Create an alias.
   * @param index the index name
   * @param alias the alias name
   * @throws Exception
   */
  protected void _createAlias(String index, String alias) throws Exception {
    //LOGGER.info("Creating alias: "+alias+" for index: "+index);
    AdminClient client = this.getTransportClient().admin();
    client.indices().prepareAliases().addAlias(index,alias).get();
  }
  
  /**
   * Create an index.
   * @param name the index name
   * @throws Exception
   */
  protected void _createIndex(String name) throws Exception {
    //LOGGER.info("Creating index: "+name);
    String path = this.getMappingsFile();
    JsonObject jso = (JsonObject)JsonUtil.readResourceFile(path);
    String json = JsonUtil.toJson(jso,false);
    AdminClient client = this.getTransportClient().admin();
    client.indices().prepareCreate(name).setSource(json).get();
  }
  
  /**
   * Ensure that an index exists.
   * @param name the index name
   * @param considerAsAlias consider creating an aliased index
   * @throws Exception if an exception occurs
   */
  public void ensureIndex(String name, boolean considerAsAlias) throws Exception {
    LOGGER.debug("Checking index: "+name);
    try {
      if (name == null || name.trim().length() == 0) return;
      AdminClient client = this.getTransportClient().admin();
      boolean exists = client.indices().prepareExists(name).get().isExists();
      if (exists) return;
      if (name.equals(this.getItemIndexName())) {
        considerAsAlias = this.getIndexNameIsAlias();
      }
      if (name.indexOf("_v") != -1) considerAsAlias = false;
      if (!considerAsAlias) {
        _createIndex(name);
      } else {
        
        String pfx = name+"_v";
        String idxName = null;
        int sfx = -1;
        ImmutableOpenMap<String,Settings> all;
        all = client.indices().prepareGetSettings("*").get().getIndexToSettings();
        Iterator<ObjectObjectCursor<String,Settings>> iter = all.iterator();
        while (iter.hasNext()) {
          ObjectObjectCursor<String,Settings> o = iter.next();
          if (o.key.startsWith(pfx)) {
            String s = o.key.substring(pfx.length());
            int i = Val.chkInt(s,-1);
            if (i > sfx) {
              sfx = i;
              idxName = o.key;
            }
          }
        }
        if (idxName == null) {
          idxName = pfx+"1";
          _createIndex(idxName);
        }
        _createAlias(idxName,name);
      }
    } catch (Exception e) {
      LOGGER.error("Error executing ensureIndex()",e);
      throw e;
    }
  }
  
  /**
   * Return an array of node names.
   * <br/>Names are split by commas.
   * @return the node names
   */
  public String[] nodesToArray() {
    ArrayList<String> al = new ArrayList<String>();
    if (getNodes() != null) {
      for (String node: this.getNodes()) {
        String[] a = node.split(",");
        for (String v: a) {
          v = v.trim();
          if (v.length() > 0) al.add(v);
        }
      }
    }
    return al.toArray(new String[0]);
  }
  
  /** Shutdown. */
  @PreDestroy
  public void shutdown() throws Exception {
    LOGGER.info("Shutting down ElasticContext...");
    if (transportClient != null) {
      transportClient.close();
      transportClient = null;
    }
  }
  
  /** Startup. */
  @PostConstruct
  public void startup() throws Exception {
    LOGGER.info("Starting up ElasticContext...");
    String[] nodeNames = this.nodesToArray();
    if ((nodeNames == null) || (nodeNames.length == 0)) {
      LOGGER.warn("Configuration warning: Elasticsearch - no nodes defined.");
    } else if (transportClient != null) {
      LOGGER.warn("Configuration warning: TransportClient has already been started.");
    } else {
      if (clusterName != null && clusterName.length() > 0) {
        /* ES 2to5 */
        //Settings settings = Settings.settingsBuilder().put("cluster.name",clusterName).build();
        Settings settings = Settings.builder().put("cluster.name",clusterName).build();
        /* ES 2to5 */
        // transportClient = TransportClient.builder().settings(settings).build();
        transportClient = new PreBuiltTransportClient(settings);
      } else {
        /* ES 2to5 */
        //transportClient = TransportClient.builder().build();
        transportClient = new PreBuiltTransportClient(Settings.EMPTY);
      }
      for (String node: nodeNames) {
        InetAddress a = InetAddress.getByName(node);
        transportClient.addTransportAddress(new InetSocketTransportAddress(a,transportPort));
      }
      
      if (this.getAutoCreateIndex()) {
        String indexName = getItemIndexName();
        boolean indexNameIsAlias = getIndexNameIsAlias();
        try {
          ensureIndex(indexName,indexNameIsAlias);
        } catch (Exception e) {
          // keep trying - every 5 minutes
          long period = 1000 * 60 * 5;
          long delay = period;
          Timer timer = new Timer(true);
          timer.scheduleAtFixedRate(new TimerTask() {
            @Override
            public void run() {
              try {
                ensureIndex(indexName,indexNameIsAlias);
                timer.cancel();
              } catch (Exception e2) {
                // logging is handled by ensureIndex
              }
            }      
          },delay,period);
        }
      }
      
    }
  }

}
