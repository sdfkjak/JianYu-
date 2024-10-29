const res = require("express/lib/response");
const mysql = require("mysql");
const { v4: uuidv4 } = require('uuid');



const pool = mysql.createPool({
    host: "127.0.0.1", // 主机地址
    port: 3307,
    database: "chatapp", // 数据库名字
    user: "root", // 连接数据库的用户名
    password: "Clementine", // 连接数据库密码
    connectionLimit: 20, // 连接池最大连接数
    multipleStatements: true // 允许执行多条sql语句
})

function getUserComInfo(id) {
    return new Promise((resolve, reject) => {
        pool.getConnection((err, conn) => {
            if (err) {
                reject(new Error('数据库连接失败'));
            } else {
                const querySql_user_id = 'SELECT user_id, user_nickname, user_sex, user_area FROM user_info WHERE user_id = ?';
                conn.query(querySql_user_id, [id], (err, result) => {
                    if (err) {
                        conn.release();
                        reject(new Error('数据库查询失败'));
                    } else {
                        console.log(result);
                        if (result.length != 0) {
                            conn.release();
                            console.log("111");
                            result = result[0]
                            resolve(result); // 将结果传递给Promise链的后续处理者  
                        } else {
                            console.log("222");
                            const querySql_user_phone = 'SELECT user_id, user_nickname, user_sex, user_area FROM user_info WHERE user_phone = ?';
                            conn.query(querySql_user_phone, [id], (err, result) => {
                                conn.release(); // 无论是否发生错误，都释放连接 
                                if (err) {
                                    reject(new Error('数据库查询失败'));
                                } else {
                                    result = result[0]
                                    resolve(result); // 将结果传递给Promise链的后续处理者  
                                }
                            })
                        }
                    }
                });
            }
        });
    });
}

function updateUserInfo(id, item, value) {
    return new Promise((resolve, reject) => {
        pool.getConnection((err, conn) => {
            if (err) {
                reject(new Error('数据库连接失败'));
            } else {
                const updateSql = `UPDATE user_info SET ${item} = ? WHERE user_id = ?`;
                conn.query(updateSql, [value, id], (err, result) => {
                    if (err) {
                        reject(new Error(err));
                    } else {
                        try {
                            conn.release(); // 尝试释放连接  
                        } catch (releaseErr) {
                            // 如果释放连接失败，记录错误  
                            console.error('释放数据库连接时出错:', releaseErr);
                        }
                        // 无论是否发生错误，都解析查询结果  
                        resolve("更新用户信息成功");
                    }
                });
            }
        });
    });
}

function insertUserInfo(id, password, nickname, phone){
    return new Promise((resolve, reject) => {
        pool.getConnection((err, conn) => {
            if(err) reject("连接失败")
                insertSql = `insert into user_info (user_id, user_password, user_nickname, user_phone) values(?, ?, ?, ?)`
                conn.query(insertSql, [id, password, nickname, phone], (err, result) => {
                    if(err) reject("插入失败")
                    resolve(true)
                })
        })
    })
}

function isUserExist(value, item){
    return new Promise((resolve, reject) => {
        pool.getConnection((err, conn) => {
            if(err) reject("连接失败")
            conn.query(`select count(*) as count from user_info where ${item} = ?`, [value], (err, result) => {
                conn.release()
                if(err) reject("连接失败")
                resolve (!!result[0].count)
            })
        })
    })
}

function generateUniqueId(){
    return new Promise((resolve, reject) => {
        let generatedJyId = "jyid_" + uuidv4().slice(25);
        isUserExist(generatedJyId, "user_id")
        .then(isExist => {
            isExist? generateUniqueId() : resolve(generatedJyId)  
        })
    })
}
module.exports = {
    pool,
    getUserComInfo,
    updateUserInfo,
    insertUserInfo,
    isUserExist,
    generateUniqueId
};
