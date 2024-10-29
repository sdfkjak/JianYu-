import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';
import Redis from 'ioredis';
import { getUserComInfo, updateUserInfo } from '../DataBase/mysqlPool.js';
import { stringify, v4 as uuidv4 } from 'uuid';
import { timeStamp } from 'console';

const wss = new WebSocketServer({ port: 8080, host: '172.19.50.90' });
const redisClient = new Redis();

const socketclients = new Map();

wss.on('connection', function connection(ws) {
  console.log("client error");
  const clientId = generateClientId()
  socketclients.set(clientId, ws)

  ws.on('error', function error() {
    console.log("client error");
  });

  ws.on('message', function message(data) {
    try {
      let dataJson = JSON.parse(data)
      console.log('received: %s', data);
      switch (dataJson.type) {
        case "FRIENDREQUEST":
          const uuid = uuidv4();
          //先在双方friendrequest添加好友请求
          redisClient.zadd(`chatapp:${dataJson.source}:friendrequest`, 0, uuid)
            .then(() => {
              return redisClient.zadd(`chatapp:${dataJson.target}:friendrequest`, 0, uuid)
            })
            .then(() => {
              const saveformat = {
                "friendRequestsId": uuid,
                "source": {
                  "jyId": dataJson.source
                },
                "target": {
                  "jyId": dataJson.target
                },
                "message": []
              }
              //如果有附加消息就添加进去
              if ("message" in dataJson && dataJson.message !== null) {
                saveformat.message.push({
                  "source": dataJson.source,
                  "timestamp": dataJson.timestamp,
                  "content": dataJson.content
                })
              }
              //好友请求消息真正存储地址
              return redisClient.set(`chatapp:chatpool:privatechat:friendrequest:${uuid}`, JSON.stringify(saveformat))
            })
            .then(() => {
              if (clientExist(dataJson.target)) {
                //对方在线直接添加
                getUserComInfo(dataJson.source)
                  .then(user_info => {
                    const sendFriendRequest = {
                      type: "FRIENDAPPLICATION",
                      friendRequestsId: uuid,
                      mode: "passive",
                      user_info: user_info,
                      //虽然就一句但为了客户端改成了[]
                      message: [{
                        user: dataJson.source,
                        content: dataJson.content
                      }]
                    }
                    sendMessageToClient(dataJson.target, JSON.stringify(sendFriendRequest));
                    sendMessageToClient(dataJson.target, buildBufferData("FRIENDAPPLICATIONINIT", dataJson.source, null, getUserAvatar(user_info.user_id)));
                  })
              }
            })
            .catch(err => {
              redisClient.del([`chatapp:${dataJson.source}:friendrequest:${uuid}`, `chatapp:${dataJson.target}:friendrequest:${uuid}`, `chatapp:chatpool:privatechat:friendrequest:${uuid}`])
              console.log("添加好友请求id失败", err)
            })
          break;
        case 'ACCEPTFRIENDREQUEST':
          redisClient.get(`chatapp:chatpool:privatechat:friendrequest:${dataJson.friendRequestId}`)
            .then(stringifyJson => {
              const friendrequestJson = JSON.parse(stringifyJson);
              if (friendrequestJson.source.jyId === dataJson.target && friendrequestJson.target.jyId === dataJson.source) {
                return Promise.all([redisClient.zadd(`chatapp:${dataJson.target}:friendrequest`, 1, dataJson.friendRequestId),
                redisClient.zadd(`chatapp:${dataJson.target}:friend`, 1, dataJson.source),
                redisClient.zadd(`chatapp:${dataJson.source}:friendrequest`, 1, dataJson.friendRequestId),
                redisClient.zadd(`chatapp:${dataJson.source}:friend`, 1, dataJson.target)
                ])
              }
            })
            .then(() => {
              const friendChatuuid = uuidv4();
              dataJson.friendChatuuid = friendChatuuid;
              const friendChatString = JSON.stringify({
                friendChatId: friendChatuuid,
                source: dataJson.source,
                target: dataJson.target,
                friendChatMessage: []
              })
              return Promise.all([redisClient.zadd(`chatapp:${dataJson.target}:friendchat`, 1, friendChatuuid),
              redisClient.zadd(`chatapp:${dataJson.source}:friendchat`, 1, friendChatuuid),
              redisClient.set(`chatapp:chatpool:privatechat:friendchat:${friendChatuuid}`, friendChatString)])
            })
            .then(() => {
              if (clientExist(dataJson.source)) {
                getUserComInfo(dataJson.target)
                  .then(user_info => {
                    user_info.friendChatId = dataJson.friendChatuuid;
                    const friendBaseInfo = {
                      type: "ADDFRIENDINFO",
                      newFriendInfo: [user_info]
                    }
                    sendMessageToClient(dataJson.source, JSON.stringify(friendBaseInfo))
                    sendMessageToClient(dataJson.source, buildBufferData("ADDFRIENDINFO", dataJson.target, null, getUserAvatar(user_info.user_id)))
                  })
              }
              if (clientExist(dataJson.target)) {
                getUserComInfo(dataJson.source)
                  .then(user_info => {
                    user_info.friendChatId = dataJson.friendChatuuid;
                    const friendBaseInfo = {
                      type: "ADDFRIENDINFO",
                      newFriendInfo: [user_info]
                    }
                    sendMessageToClient(dataJson.target, JSON.stringify(friendBaseInfo))
                    sendMessageToClient(dataJson.target, buildBufferData("ADDFRIENDINFO", dataJson.source, null, getUserAvatar(user_info.user_id)))
                  })
              }
            })
            .catch(err => {
              throw new Error("同意好友请求失败", err)
            })
          break;
        case 'FRIENDCHAT':
          redisClient.zrange(`chatapp:${dataJson.source}:friendchat`, 0, -1)
            .then(friendChatuuids => {
              const friendChatuuidMatch = friendChatuuids.find(friendChatuuid => friendChatuuid === dataJson.friendChatId);
              if (!friendChatuuidMatch) {
                throw Error('消息目标不存在friendChatId')
              }
              return redisClient.get(`chatapp:chatpool:privatechat:friendchat:${dataJson.friendChatId}`)
            })
            .then(stringifyJson => {
              // console.log("得到", stringifyJson)
              const savedFriendChatJson = JSON.parse(stringifyJson)
              if (!((savedFriendChatJson.source === dataJson.source && savedFriendChatJson.target === dataJson.target) || (savedFriendChatJson.source === dataJson.target && savedFriendChatJson.target === dataJson.source))) {
                throw Error(`消息目标不存在${savedFriendChatJson}`)
              }
              savedFriendChatJson.friendChatMessage.push(dataJson.friendChatMessage)
              // console.log("存入", JSON.stringify(savedFriendChatJson))
              redisClient.set(`chatapp:chatpool:privatechat:friendchat:${dataJson.friendChatId}`, JSON.stringify(savedFriendChatJson))
              if (clientExist(dataJson.target)) {
                const sendFriendChatMessage = {
                  type: "FRIENDCHAT",
                  FRIENDCHAT: [{
                    chatTarget: dataJson.source,
                    friendChatMessage: [dataJson.friendChatMessage]
                  }]
                }
                console.log("dataJson.friendChatMessage ", dataJson.friendChatMessage)
                sendMessageToClient(dataJson.target, JSON.stringify(sendFriendChatMessage))
              }
            })
            .catch(error => {
              console.error('处理聊天消息时出错:', error);
            });
          break;
        case 'INITCLIENT':
          if ("jyId" in dataJson) {
            socketIdInit(clientId, dataJson.jyId)
            socketclients.forEach((value, key) => {
              console.log(`当前存在客户端jyId: ${key}`)
            })
            console.log("初始化")
            loginInit(dataJson.jyId, ws);
            console.log("欢迎用户" + dataJson.jyId);
          }
          console.log(dataJson)
          if ("needInfo" in dataJson && dataJson.needInfo == true) {
            console.log("需要初始化");
            getUserComInfo(dataJson.jyId)
              .then(user_info => {
                sendMessageToClient(dataJson.jyId, JSON.stringify({ "type": "USERINIT", "userInfo": user_info }));
                sendMessageToClient(dataJson.jyId, buildBufferData("USERINIT", dataJson.jyId, null, getUserAvatar(dataJson.jyId)));
              })
          }
          break;
        case 'MODIFYPERSONALINFO':
          getUserComInfo(dataJson.source)
            .then((user_info) => {
              switch (dataJson.item) {
                case 'avatar':
                  updateUserInfo(dataJson.source, "user_avatar", dataJson.value)
                    .then(() => {
                      return redisClient.zrange(`chatapp:${dataJson.source}:friend`, 0, -1)
                    })
                    .then(friends => {
                      return Promise.all(friends.map(friend => {
                        if (clientExist(friend)) {
                          const modifyUserComInfoJson = {
                            type: "MODIFYPERSONALINFO",
                            user_info: user_info
                          }
                          sendMessageToClient(friend, JSON.stringify(modifyUserComInfoJson));
                          sendMessageToClient(friend, buildBufferData("MODIFYPERSONALINFO", dataJson.source, null, getUserAvatar(user_info.user_id)));
                          return;
                        } else {
                          return redisClient.zadd(`chatapp:${friend}:friend`, 0, dataJson.source)
                        }
                      }))
                    })
                    .catch(err => {
                      console.log(err)
                    })
                  break;
              }
            })
          break;
        case "QUERYUSER":
          getUserComInfo(dataJson.searchString)
            .then(user_info => {
              if (user_info) {
                sendMessageToClient(dataJson.source, JSON.stringify({ "type": "QUERYUSERRESULT", "userInfo": user_info }))
                sendMessageToClient(dataJson.source, buildBufferData("QUERYUSERRESULT", dataJson.source, null, getUserAvatar(user_info.user_id)))
              } else {
                console.log("错误查询QUERYUSER");
              }
            })
          break;
      }
    } catch (err) {
      // console.log('received: %s', err.message);
      if (err instanceof SyntaxError) {
        dealBufferMessage(data);
      } else {
        // 如果需要，可以处理其他类型的错误  
        console.error('An unexpected error occurred:', err);
      }
    }
  });

  ws.on('close', function close() {
    socketIdDelete(ws)
    console.log('client disconnected');
  });
});

function dealBufferMessage(buffer) {
  const messageFieldStringArray = parseBuffer(buffer.slice(0, 150));
  switch (messageFieldStringArray[0]) {
    case "FRIENDCHAT":
      saveFriendChatImageToRedisAndSendIfOnline(messageFieldStringArray[1], messageFieldStringArray[2], messageFieldStringArray[3], messageFieldStringArray[4], buffer.slice(150, buffer.length))
      saveFriendChatImage(buffer.slice(150, buffer.length), messageFieldStringArray[4], messageFieldStringArray[3]);
      break;
    case "MODIFYPERSONALINFO":
      saveUserAvatar(messageFieldStringArray[1], buffer.slice(150, buffer.length));
      redisClient.zrange(`chatapp:${messageFieldStringArray[1]}:friend`, 0, -1)
        .then(friends => {
          return Promise.all(friends.map(friend => {
            if (clientExist(friend)) {
              sendMessageToClient(friend, buildBufferData("MODIFYPERSONALINFO", messageFieldStringArray[1], null, buffer.slice(150, buffer.length)));
              return;
            } else {
              return redisClient.zadd(`chatapp:${friend}:friend`, 0, messageFieldStringArray[1])
            }
          }))
        })
      break;
  }

}
function parseBuffer(messageFieldBuffer) {
  // const messageFieldMap = new Map();
  const messageFieldString = messageFieldBuffer.toString('utf8');
  const messageFieldStringArray = messageFieldString.split("|");

  //类型，来源， 目标， 时间戳， FriendChatId
  messageFieldStringArray.pop();
  return messageFieldStringArray;
}
function saveFriendChatImageToRedisAndSendIfOnline(source, target, timestamp, friendChatId, imgBuffer) {
  console.log("source", source);
  redisClient.zrange(`chatapp:${source}:friendchat`, 0, -1)
    .then(friendChatuuids => {
      const friendChatuuidMatch = friendChatuuids.find(friendChatuuid => friendChatuuid === friendChatId)
      if (!friendChatuuidMatch) {
        throw Error('消息目标不存在friendChatId')
      }
      return redisClient.get(`chatapp:chatpool:privatechat:friendchat:${friendChatId}`)
    })
    .then(stringifyJson => {
      const savedFriendChatJson = JSON.parse(stringifyJson)
      if (!((savedFriendChatJson.source === source && savedFriendChatJson.target === target) || (savedFriendChatJson.source === target && savedFriendChatJson.target === source))) {
        throw Error(`消息目标不存在${savedFriendChatJson}`)
      }
      const friendChatImageMessage = {
        "content": "",
        "source": source,
        "timestamp": timestamp,
        "type": "FRIENDCHATIMAGEMESSAGE"
      }
      savedFriendChatJson.friendChatMessage.push(friendChatImageMessage)
      
      redisClient.set(`chatapp:chatpool:privatechat:friendchat:${friendChatId}`, JSON.stringify(savedFriendChatJson))
      console.log("cunzaima1");
      if (clientExist(target)) {
        const sendMessage = {
          "type": 'FRIENDCHAT',
          "FRIENDCHAT": [{
            content: '',
            source: 'jyid_77ba7417fd4',
            timestamp: timestamp,
            type: 'FRIENDCHATIMAGEMESSAGE'
          }]
        }
        console.log("存入", "在线")
        sendMessageToClient(target,JSON.stringify(sendMessage))
        sendMessageToClient(target, buildBufferData("FRIENDCHATIMAGEMESSAGE", source, timestamp, imgBuffer))
      }
    })
}

function saveUserAvatar(jyid, avatarBuffer) {
  if (!fs.existsSync(`C:\\Users\\zzq\\Desktop\\ChatAppData\\UserAvatar`)) {
    fs.mkdir(`C:\\Users\\zzq\\Desktop\\ChatAppData\\UserAvatar`, { recursive: true }, err => {
      if (err) throw err;
    })
  }
  fs.writeFile(`C:\\Users\\zzq\\Desktop\\ChatAppData\\UserAvatar\\${jyid}.png`, avatarBuffer, { encoding: 'binary' }, err => {
    if (err) {
      console.error('写入文件时发生错误:', err);
    } else {
      console.log('文件已成功写入');
    }
  })
}

function getUserAvatar(jyid) {
  return fs.readFileSync(`C:\\Users\\zzq\\Desktop\\ChatAppData\\UserAvatar\\${jyid}.png`)
}

function saveFriendChatImage(data, friedChatId, timestamp) {
  if (!fs.existsSync(`C:\\Users\\zzq\\Desktop\\ChatAppData\\${friedChatId}`)) {
    fs.mkdir(`C:\\Users\\zzq\\Desktop\\ChatAppData\\${friedChatId}`, { recursive: true }, err => {
      if (err) throw err;
    })
  }
  fs.writeFile(`C:\\Users\\zzq\\Desktop\\ChatAppData\\${friedChatId}\\${timestamp}.png`, data, { encoding: 'binary' }, err => {
    if (err) {
      console.error('写入文件时发生错误:', err);
    } else {
      console.log('文件已成功写入');
    }
  })
}

function generateClientId() {
  let isRepeat, id;
  do {
    isRepeat = false;
    id = Math.random().toString(36).substring(7);
    socketclients.forEach((value, key) => {
      if (key == id) {
        isRepeat = true
      }
    })
  } while (isRepeat)
  return id;
}

function buildBufferData(type, source, timestamp, imgBuffer) {
  console.log(imgBuffer.length)
  let typeBuffer = null, sourceBuffer = null, timestampBuffer = null, labelBuffer = null, totalBuffer = null;

  if (type != null) {
    typeBuffer = Buffer.from(type + "|");
  } else {
    typeBuffer = Buffer.from("type|");
  }
  if (source != null) {
    sourceBuffer = Buffer.from(source + "|");
  } else {
    sourceBuffer = Buffer.from("source|");
  }

  if (timestamp != null) {
    timestampBuffer = Buffer.from(timestamp + "|");
  } else {
    timestampBuffer = Buffer.from("timestamp|");
  }

  labelBuffer = Buffer.concat([typeBuffer, sourceBuffer, timestampBuffer])
  console.log(`生成Buffer类型${type}, 来源${source}`);
  if (labelBuffer.length <= 100) {
    labelBuffer = Buffer.concat([labelBuffer, Buffer.alloc(100 - labelBuffer.length)])
  } else (
    console.log("labelBuffer 怎么会大于100")
  )
  totalBuffer = Buffer.concat([labelBuffer, imgBuffer])
  console.log(totalBuffer.length)
  return totalBuffer
}

function sendMessageToClient(clientId, message) {
  let client = socketclients.get(clientId);
  if (client) {
    client.send(message);
  } else {
    console.error(`Client ${clientId} not found`);
  }
}

function clientExist(targetClient) {
  return socketclients.has(targetClient);
}

function socketIdInit(oldId, newId) {
  let thisws = socketclients.get(oldId)
  socketclients.delete(oldId)
  socketclients.set(newId, thisws)
}

function socketIdDelete(ws) {
  for (let [key, value] of socketclients) {
    if (value == ws) {
      socketclients.delete(key);
    }
  }
}

function loginInit(account) {
  Promise.all([friendRequestsInit(account), friendInit(account), messageInit(account)]).then(jsons => {
    if (jsons[0] != null && jsons[0].length != 0) {
      const dataJson = {};
      dataJson.type = "FRIENDAPPLICATIONINIT";
      const friendApplicationAvatarBufferList = [];
      jsons[0].forEach(friendRequestDatas => {

        friendApplicationAvatarBufferList.push(buildBufferData("FRIENDAPPLICATIONINIT", friendRequestDatas.user_info.user_id, null, getUserAvatar(friendRequestDatas.user_info.user_id)))
      })
      dataJson.FRIENDAPPLICATIONINITLIST = jsons[0]
      // console.log("发送的消息", JSON.stringify(dataJson))
      sendMessageToClient(account, JSON.stringify(dataJson))
      friendApplicationAvatarBufferList.forEach(friendApplicationAvatarBuffer => {
        sendMessageToClient(account, friendApplicationAvatarBuffer)
      })
    }
    if (jsons[1] != null && jsons[1].length != 0) {
      const dataJson = {};
      dataJson.type = "FRIENDINIT";
      console.log("发送的消息", "FRIENDINIT")
      const friendInitAvatarBufferList = [];
      jsons[1].forEach(user_info => {
        friendInitAvatarBufferList.push(buildBufferData("FRIENDINIT", user_info.user_id, null, getUserAvatar(user_info.user_id)))
      })
      dataJson.FRIENDINIT = jsons[1]
      // console.log("发送的消息", JSON.stringify(dataJson))
      sendMessageToClient(account, JSON.stringify(dataJson))
      friendInitAvatarBufferList.forEach(friendInitAvatarBuffer => {
        sendMessageToClient(account, friendInitAvatarBuffer)
      })
    }
    if (jsons[2] != null && jsons[2].length != 0) {
      const dataJson = {};
      dataJson.type = "FRIENDCHATINIT";
      dataJson.FRIENDCHATINIT = jsons[2]
      // console.log("发送的消息", JSON.stringify(dataJson))
      sendMessageToClient(account, JSON.stringify(dataJson))
    }
  })
}

function friendRequestsInit(account) {
  let allfriendrequest = [];
  return redisClient.zrangebyscore(`chatapp:${account}:friendrequest`, 0, 0)
    .then(members => {
      if (!members || members.length === 0) {
        console.log(`用户${account}没有收到好友请求`)
        return []; // 如果没有成员，返回空数组  
      }
      return Promise.all(members.map(member => {
        return redisClient.get(`chatapp:chatpool:privatechat:friendrequest:${member}`)
          .then(stringifyJson => {
            const friendrequestjson = JSON.parse(stringifyJson)
            // if (account === friendrequestjson.source.jyId) {
            //   return getUserComInfo(friendrequestjson.target.jyId)
            //     .then(user_info => {
            //       allfriendrequest.push({
            //         friendRequestsId: friendrequestjson.friendRequestsId,
            //         mode: "active",
            //         user_info: user_info,
            //         message: friendrequestjson.message
            //       });
            //     }).catch(err => {
            //       throw new Error("处理好友请求时发生错误", err)
            //     });
            // }
            if (account === friendrequestjson.target.jyId) {
              return getUserComInfo(friendrequestjson.source.jyId)
                .then(user_info => {
                  allfriendrequest.push({
                    friendRequestsId: friendrequestjson.friendRequestsId,
                    mode: "passive",
                    user_info: user_info,
                    message: friendrequestjson.message
                  });
                }).catch(err => {
                  throw new Error("处理好友请求时发生错误", err)
                });
            }
          });
      }));
    })
    .then(() => {
      return allfriendrequest.length ? allfriendrequest : null// 返回结果  
    })
    .catch(err => {
      console.error('处理好友请求时发生错误:', err);
    });
}

function friendInit(account) {
  return redisClient.zrange(`chatapp:${account}:friend`, 0, -1)
    .then(allFriend => {
      console.log("好有个数", allFriend)
      return getAllFriendBaseInfo(allFriend)
    })
    .catch(err => {
      throw new Error("???", err)
    })
}

function messageInit(account) {
  redisClient.zrange(`chatapp:${account}:friendchat`, 0, -1)
    .then(members => {
      members.forEach(member => {
        console.log("member", member)
        const folderPath = `C:\\Users\\zzq\\Desktop\\ChatAppData\\${member}`;
        fs.readdir(folderPath, function (err, files) {
          if (err) {
            return;
            // throw new Error("读取文件夹失败")
          }
          for (let i = 0; i < files.length; i++) {
            fs.readFile(path.join(folderPath, files[i]), function (err, data) {
              if (err) {
                return console.error(err);
              }
              console.log("data", data)
              const fileName = files[i].toString();
              const timestamp = fileName.slice(0, fileName.indexOf("."))
              console.log("timestamp", timestamp)
              sendMessageToClient(account, buildBufferData("FRIENDCHATIMAGEMESSAGE", member, timestamp, data));
            })
          }
        })
      })
    })

  return redisClient.zrange(`chatapp:${account}:friendchat`, 0, -1)
    .then(members => {
      return Promise.all(members.map(member => {
        return redisClient.get(`chatapp:chatpool:privatechat:friendchat:${member}`)
          .then(stringifyJson => {
            const savedFriendChat = JSON.parse(stringifyJson)
            const friendChatMessageJson = {
              chatTarget: savedFriendChat.source === account ? savedFriendChat.target : savedFriendChat.source,
              friendChatMessage: savedFriendChat.friendChatMessage
            }
            return friendChatMessageJson
          })
      })
      )
    })
    .catch(err => {
      console.error('初始化处理聊天消息时出错:', err);
    })
}

function getAllFriendBaseInfo(accounts) {
  if (typeof accounts === "string") {
    accounts = [accounts]
  }
  return Promise.all(accounts.map(account => {
    return getUserComInfo(account)
      .then(user_info => {
        return user_info
      })
      .catch(err => {
        throw new Error("查询出错", err)
      })
  }))
    .then(user_infos => {
      return Promise.all(user_infos.map(user_info => {
        return redisClient.zrange(`chatapp:${user_info.user_id}:friendchat`, 0, -1)
          .then(friendchatuuids => {
            friendchatuuids.forEach(friendchatuuid => {
              user_info.friendChatId = friendchatuuid;
            })
            return user_info
          })
          .catch(err => {
            throw Error("好友聊天uuid获取失败", err)
          })
      }))
    })
    .then((user_infos) => {
      return user_infos;
    })
}
