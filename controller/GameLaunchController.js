// controllers/gameController.js
import GameList from "../models/gameListModel.js";
import mongoose from "mongoose";
import axios from "axios";
import { aesEncrypt,aesDecrypt } from "../utils/aes.js";
import UserProviderAccess from "../models/userProviderAccessModel.js";
import User from "../models/UserModel.js";
import SubUser from "../models/SubUser.js";
import SubUserBalanceChange from "../models/SubUserBalanceChange.js";
import RawGameTransaction from "../models/RawGameTransaction.js";
import GameTransaction from "../models/GameTransaction.js";
import GGRLog from "../models/GGRLog.js";
import { HttpsProxyAgent } from "https-proxy-agent";
// import moment from "moment";
import { log } from "console";
import moment from "moment-timezone";
// import BalanceTransferLog from "../models/BalanceTransferLog.js";


export const getLunchGameDetails = async (req, res) => {
  // console.log("kjhgghghg");
  
  const { allowedProviders } = req;
  console.log("allowedProviders",allowedProviders);

  console.log("req.query",req.query);
  
  
  try {
    const { provider_list, gametype_list, provider, game_type, size, page } = req.query;

    // Provider list
    if (provider_list == 1) {
      return res.json({
        status: true,
        message: "Provider list fetched successfully.",
        // providers: allowedProviders,
      });
    }

    // Game type list
    if (gametype_list == 1) {
      const gameTypes = await GameList.distinct("game_type", {
        // provider: { $in: allowedProviders },
        status: 1,
      });

      return res.json({
        status: true,
        message: "Game type list fetched successfully.",
        game_types: gameTypes,
      });
    }

    let filter = {
      // provider: { $in: allowedProviders },
      status: 1,
    };

    if (provider) filter.provider = provider;
    if (game_type) filter.game_type = game_type;

    const pageSize = parseInt(size) || 2000;
    const pageNumber = parseInt(page) || 1;
    const skip = (pageNumber - 1) * pageSize;

    const total = await GameList.countDocuments(filter);
    const games = await GameList.find(filter)
      .select("id game_name game_uid game_type provider icon")
      .skip(skip)
      .limit(pageSize)
      .lean();

    return res.json({
      status: true,
      message: "Game data fetched successfully.",
      total_games: total,
      current_page: pageNumber,
      per_page: pageSize,
      data: games,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const getActiveProviders = async (req, res) => {
  try {
    const userId = req?.user?._id;
    const {page, size} = req.query;

    if (!userId) {
      return res.status(400).json({
        status: false,
        message: "User ID is required",
      });
    }

    /* Pagination */
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limit = Math.max(parseInt(size, 10) || 10, 1);
    const skip = (pageNumber - 1) * limit;

    const providerAccess = await UserProviderAccess
      .findOne({ userId })
      .lean();

    if (!providerAccess?.providers?.length) {
      return res.status(404).json({
        status: false,
        message: "Provider access not found",
      });
    }

    /* Filter active providers */
    const activeProviders = providerAccess.providers.filter(
      provider => provider.status === 1
    );

    const totalProviders = activeProviders.length;

    /* Apply pagination */
    const providers = activeProviders.slice(skip, skip + limit);

    return res.status(200).json({
      status: true,
      message: "Active providers fetched successfully",
      total_providers: totalProviders,
      current_page:pageNumber,
      per_page: limit,
      providers,
    });

  } catch (error) {
    console.error("getActiveProviders Error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};


export const getLaunchUrlSeamless = async (req, res) => {
  
  const session = await mongoose.startSession();
  session.startTransaction();
  const { uid, key, playerid, opening_balance } = req.body;
  

  try {
    /* ================= VALIDATION ================= */

    if (!uid || !key || !playerid || opening_balance === undefined) {
      return res.status(422).json({
        status: false,
        message: "uid, key, playerid and opening_balance are required",
      });
    }

    /* ================= CONFIG ================= */
    const agency_uid = "1b6ad0c8122f6b07955595984682e752";
    // const aes_key = "ca51aaabb5e8725f29cd42aa29623b48";
   const aes_key = Buffer.from(
      "ca51aaabb5e8725f29cd42aa29623b48",
      "utf8"   // 👈 VERY IMPORTANT
    );

    const currency_code = "INR";
    const timestamp = Date.now().toString();
    const language = "en";
    const home_url = "https://api-docs.space/";
    const platform = "web";
    const callback_url = "https://api-docs.space/api/huidu/seamless-callback";

    const proxy = {
      host: "154.6.83.203",
      port: 6674,
      auth: {
        username: "trqjnemy",
        password: "34pw1x8rcxr3",
      },
    };

    const proxyAgent = new HttpsProxyAgent(
  "http://trqjnemy:34pw1x8rcxr3@154.6.83.203:6674"
);

    /* ================= USER ================= */
    const user = await User.findOne({ key }).session(session);
    if (!user) throw new Error("User not found");
    if (user.isActive !== 1) throw new Error("User is not active");

    // console.log("user",user);
    

    /* ================= GAME ================= */
    const game = await GameList.findOne({ game_uid: uid });
    if (!game) throw new Error("Game not found for this UID");

  

    const providerAccess = await UserProviderAccess.findOne({
    userId: user._id,
    providers: {
      $elemMatch: {
        status: 1,
        $or: [
          { name: { $regex: `^${game.provider}$`, $options: "i" } },
          { path: { $regex: `^${game.provider}$`, $options: "i" } }
        ]
      }
     }
    });


    if (!providerAccess)
      throw new Error(`User does not have access to this game provider ${game.provider}`);

    /* ================= IP VALIDATION ================= */
    const requestIp =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

      // console.log("requestIp",requestIp);
      

    // const allowedIpv4 =
    //   user.ipv4_address?.split(",").map(ip => ip.trim()) || [];

    const allowedIpv4 = (user.ipv4_address || []).map(ip => ip.trim());

    if (allowedIpv4.length && !allowedIpv4.includes(requestIp)) {
      throw new Error("Unauthorized request origin11");
    }

    /* ================= USERNAME BUILD ================= */
    const cleanPlayerId = String(playerid).slice(-7);
    const fundUsername = `hf743a${user.prefix}${cleanPlayerId}`;
    const seamlessUsername = `${fundUsername}s`;

    // console.log("fundUsername",fundUsername);
    

    /* ================= SUBUSER ================= */
    let subuser = await SubUser.findOne({
      username: { $in: [fundUsername, seamlessUsername] },
    }).session(session);

    /* ---------- NEW SUBUSER ---------- */
    if (!subuser) {
      const created = await SubUser.create(
        [
          {
            prefix: user.prefix,
            username: fundUsername,
            istransferred: 0,
            balance: Number(opening_balance),
          },
        ],
        { session }
      );

      subuser = created[0];

      // ✅ BALANCE CHANGE LOG (NEW USER)
      await SubUserBalanceChange.create(
        [
          {
            subuser_id: subuser._id,
            username: fundUsername,
            before_balance: 0,
            after_balance: Number(opening_balance),
            change_amount: Number(opening_balance),
            operation_type: "credit",
            remarks: "New subuser created and funded",
          },
        ],
        { session }
      );
    }

    /* ---------- EXISTING SUBUSER ---------- */
    else {
      const before = Number(subuser.balance);
      const after = before + Number(opening_balance);

      await SubUser.updateOne(
        { _id: subuser._id },
        { $set: { balance: after, updatedAt: new Date() } },
        { session }
      );

      subuser.balance = after;

      // ✅ BALANCE CHANGE LOG (EXISTING USER)
      await SubUserBalanceChange.create(
        [
          {
            subuser_id: subuser._id,
            username: subuser.username,
            before_balance: before,
            after_balance: after,
            change_amount: Number(opening_balance),
            operation_type: opening_balance >= 0 ? "credit" : "debit",
            remarks: "Existing user fund adjustment",
          },
        ],
        { session }
      );
    }

    /* ================= GAME LAUNCH ================= */
    let tryMigrate = false;

    const launchGame = async (username, balance) => {
      const payload = aesEncrypt(
        JSON.stringify({
          agency_uid,
          member_account: username,
          game_uid: uid,
          credit_amount: balance.toFixed(2),
          timestamp,
          currency_code,
          language,
          home_url,
          platform,
          callback_url,
        }),
        aes_key
      );

      return axios.post(
        "https://huidu.bet/game/v1",
        { agency_uid, timestamp, payload },
       {
        httpsAgent: proxyAgent,
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "identity",
        },
    }
      );
    };

    let activeUsername = subuser.istransferred
      ? seamlessUsername
      : fundUsername;

    let response = await launchGame(activeUsername, subuser.balance);

    // console.log("response",response);
    

    /* ---------- SUCCESS ---------- */
    if (response.data?.code === 10017 || response.data?.payload === "" || !response.data?.payload?.game_launch_url) {
      await session.commitTransaction();
      return res.json({
        status: false,
        message: "Game is not available",
        data: response.data,
      });
    }
    /* ---------- SUCCESS ---------- */
    if (response.data?.payload?.game_launch_url) {
      await session.commitTransaction();
      return res.json({
        status: true,
        message: "Game launch URL generated",
        launch_view_url: response.data.payload.game_launch_url,
      });
    }

    /* ---------- WALLET MODE MISMATCH (10024) ---------- */
    if (
      response.data?.code === 10024 &&
      !subuser.istransferred &&
      !tryMigrate
     ) {
      tryMigrate = true;

      // STEP 1: GET BALANCE
      const balanceRes = await axios.post(
        "https://huidu.bet/game/v2",
        {
          agency_uid,
          timestamp,
          payload: aesEncrypt(
            JSON.stringify({
              agency_uid,
              member_account: fundUsername,
              game_uid: uid,
              credit_amount: 0,
              currency_code,
              timestamp,
              transfer_id: `${Date.now()}`,
            }),
            aes_key
          ),
        },
        { proxy }
      );

      const fund_balance = Number(
        balanceRes.data?.payload?.after_amount || 0
      );

      // STEP 2: TRANSFER OUT
      await axios.post(
        "https://huidu.bet/game/v2",
        {
          agency_uid,
          timestamp,
          payload: aesEncrypt(
            JSON.stringify({
              agency_uid,
              member_account: fundUsername,
              game_uid: uid,
              credit_amount: -Math.abs(fund_balance),
              currency_code,
              timestamp,
              transfer_id: `${Date.now()}_m`,
            }),
            aes_key
          ),
        },
        { proxy }
      );

      const newBalance = subuser.balance + fund_balance;

      await SubUser.updateOne(
        { username: fundUsername },
        {
          $set: {
            username: seamlessUsername,
            istransferred: 1,
            balance: newBalance,
            updatedAt: new Date(),
          },
        },
        { session }
      );

      // RETRY WITH SEAMLESS USER
      response = await launchGame(seamlessUsername, fund_balance);

      // console.log("response",response);
      

      if (response.data?.payload?.game_launch_url) {
        await session.commitTransaction();
        return res.json({
          status: true,
          message: "Game launch URL generated",
          launch_view_url: response.data.payload.game_launch_url,
        });
      }
    }

    // throw new Error("Failed to get game launch URL");

  } catch (error) {
    await session.abortTransaction();
    console.log("error",error);
    
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  } finally {
    session.endSession();
  }
};



export const getUserBalanceLocal = async (req, res) => {
  try {
    /* ================= VALIDATION ================= */
    const { key, playerid } = req.body;

    console.log("key playerid", key, playerid);

    if (!key || !playerid) {
      return res.status(422).json({
        status: false,
        message: "key and playerid are required",
      });
    }

    /* ================= USER ================= */
    const user = await User.findOne({ key });
    if (!user) {

      return res.status(408).json({
        status: false,
        message: "User not found",
      });
    }

    /* ================= IP VALIDATION ================= */
    const requestIp =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    const allowedIpv4 =
      (user.ipv4_address || []).map(ip => ip.trim());
    // const allowedIpv6 =
    //   user.ipv6_address?.split(",").map(ip => ip.trim()) || [];

    console.log("allowedIpv4", allowedIpv4);
  
    let ipAllowed = false;

    // IPv6 check (first 4 blocks prefix match)
    // if (requestIp.includes(":")) {
    //   const reqPrefix = requestIp
    //     .toLowerCase()
    //     .split(":")
    //     .slice(0, 4)
    //     .join(":");

    // } 
    //   // 
    // // IPv4 check
    // else {
      if (allowedIpv4.includes(requestIp)) {
        ipAllowed = true;
      }
    // }

    // console.log("requestIp", requestIp);

    if (!ipAllowed) {
      return res.status(403).json({
        status: false,
        message: "Unauthorized request origin.",
        your_ip: requestIp,
      });
    }

    /* ================= USERNAME BUILD ================= */
    const cleanPlayerId = String(playerid).slice(-7);
    const fundUsername = `hf743a${user.prefix}${cleanPlayerId}`;
    const seamlessUsername = `${fundUsername}s`;

    /* ================= SUBUSER ================= */
    const subuser = await SubUser.findOne({
      username: { $in: [fundUsername, seamlessUsername] },
    }).sort({ istransferred: -1 });

    if (!subuser) {
      return res.status(200).json({
        status: false,
        message: "Subuser not found",
      });
    }

    /* ================= RESPONSE ================= */
    return res.json({
      status: true,
      message: "Balance Get Successfully.",
      Balance: subuser.balance,
    });

  } catch (error) {
    console.error("getUserBalanceLocal error:", error);
    return res.status(500).json({
      status: false,
      message: "Server Error: " + error.message,
    });
  }
};

// set ṣubuser balance on self server

export const setUserBalanceLocal = async (req, res) => {
  try {
    /* ================= VALIDATION ================= */
    const { key, playerid, opening_balance } = req.body;

    if (!key || !playerid || opening_balance === undefined) {
      return res.status(422).json({
        status: false,
        message: "key, playerid and opening_balance are required",
      });
    }

    /* ================= USER ================= */
    const user = await User.findOne({ key });
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    /* ================= IP VALIDATION ================= */
    const requestIp =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    const allowedIpv4 =
      (user.ipv4_address || []).map(ip => ip.trim());
    // const allowedIpv6 =
    //   user.ipv6_address?.split(",").map(ip => ip.trim()) || [];

    let ipAllowed = false;

    // IPv6 (/64 prefix check)
    if (requestIp.includes(":")) {
      const reqPrefix = requestIp
        .toLowerCase()
        .split(":")
        .slice(0, 4)
        .join(":");

      // for (const ipv6 of allowedIpv6) {
      //   if (
      //     ipv6
      //       .toLowerCase()
      //       .split(":")
      //       .slice(0, 4)
      //       .join(":") === reqPrefix
      //   ) {
      //     ipAllowed = true;
      //     break;
      //   }
      // }
    }
    // IPv4 exact match
    else {
      if (allowedIpv4.includes(requestIp)) {
        ipAllowed = true;
      }
    }

    if (!ipAllowed) {
      return res.status(403).json({
        status: false,
        message: "Unauthorized request origin.",
        your_ip: requestIp,
      });
    }

    /* ================= USERNAME BUILD ================= */
    const cleanPlayerId = String(playerid).slice(-7);
    const fundUsername = `hf743a${user.prefix}${cleanPlayerId}`;
    const seamlessUsername = `${fundUsername}s`;

    /* ================= SUBUSER ================= */
    const subuser = await SubUser.findOne({
      username: { $in: [fundUsername, seamlessUsername] },
    }).sort({ istransferred: -1 });

    if (!subuser) {
      return res.status(404).json({
        status: false,
        message: "Subuser not found",
      });
    }

    /* ================= BALANCE LOGIC ================= */
    const beforeBalance = Number(subuser.balance);
    const changeAmount = Number(opening_balance);
    const afterBalance = beforeBalance + changeAmount;

    if (afterBalance < 0) {
      return res.status(400).json({
        status: false,
        message: "Insufficient balance. Wallet cannot go below zero.",
        BeforeBalance: beforeBalance,
        AttemptedChange: changeAmount,
      });
    }

    /* ================= UPDATE BALANCE ================= */
    subuser.balance = afterBalance;
    subuser.updatedAt = new Date();
    await subuser.save();

    /* ================= BALANCE CHANGE LOG ================= */
    await SubUserBalanceChange.create({
      subuser_id: subuser._id,
      username: subuser.username,
      before_balance: beforeBalance,
      after_balance: afterBalance,
      change_amount: changeAmount,
      operation_type: changeAmount >= 0 ? "credit" : "debit",
      remarks: "Manual balance adjustment via setUserBalanceLocal API",
      changed_at: new Date(),
    });

    /* ================= RESPONSE ================= */
    return res.json({
      status: true,
      message: "Balance updated successfully.",
      BeforeBalance: beforeBalance,
      AfterBalance: afterBalance,
    });

  } catch (error) {
    console.error("setUserBalanceLocal error:", error);

    return res.status(500).json({
      status: false,
      message: "Server Error: " + error.message,
    });
  }
};

// get bet hitory 
export const getBetHistory = async (req, res) => {
  // console.log("req.body",req.body);
  
  try {
    /* ================= VALIDATION ================= */
    const { key, playerid, page = 1, limit = 20, from_date, to_date } = req.body;

    const cleanPlayerId = String(playerid).slice(-7);

    // console.log("cleanPlayerId",cleanPlayerId);
    

    if (!key) {
      return res.status(422).json({
        status: false,
        message: "key is required",
      });
    }

    const pageNum = Math.max(parseInt(page), 1);
    const limitNum = Math.min(parseInt(limit), 100);
    const skip = (pageNum - 1) * limitNum;

    /* ================= USER ================= */
    const user = await User.findOne({ key });
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    /* ================= QUERY BUILD ================= */
    const query = {
      prefix: user.prefix,
    };

    if (playerid) {
      query.player = cleanPlayerId;
    }

    if (from_date || to_date) {
      query.createdAt = {};
      if (from_date) query.createdAt.$gte = new Date(from_date);
      if (to_date) query.createdAt.$lte = new Date(to_date);
    }

    /* ================= TOTAL COUNT ================= */
    const total = await GameTransaction.countDocuments(query);

    /* ================= DATA FETCH ================= */
    const records = await GameTransaction.find(query)
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    /* ================= GAME DATA MAP ================= */
    const gameUids = [...new Set(records.map(r => r.game_uid))];
    const games = await GameList.find({ game_uid: { $in: gameUids } }).lean();

    const gameMap = {};
    games.forEach(g => {
      gameMap[g.game_uid] = g;
    });

    const finalData = records.map(r => ({
      id: r._id,
      player: r.player,
      game_uid: r.game_uid,
      game_round: r.game_round,
      bet_amount: r.bet_amount,
      win_amount: r.win_amount,
      status: r.status,
      currency_code: r.currency_code,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
      game_name: gameMap[r.game_uid]?.game_name || null,
      game_type: gameMap[r.game_uid]?.game_type || null,
      provider: gameMap[r.game_uid]?.provider || null,
      icon: gameMap[r.game_uid]?.icon || null,
    }));

    // console.log("finalData",finalData);
    

    /* ================= RESPONSE ================= */
    return res.json({
      status: true,
      Balance: user.balance,
      data: finalData,
      pagination: {
        total,
        current_page: pageNum,
        per_page: limitNum,
        last_page: Math.ceil(total / limitNum),
      },
    });

  } catch (error) {
    console.error("getBetHistory error:", error);
    return res.status(500).json({
      status: false,
      message: "Server Error: " + error.message,
    });
  }
};

// controllers/seamlessCallbackController.js

export const handleSeamlessCallback = async (req, res) => {
  try {
 const aes_key = Buffer.from(
    "ca51aaabb5e8725f29cd42aa29623b48",
    "utf8"   // 👈 VERY IMPORTANT
  );

    const currency_code = "INR";
    const callback_time = new Date();

    /* ================= PAYLOAD ================= */
    const encryptedPayload = req.body.payload;

    // console.log("encryptedPayload callbacke",encryptedPayload);
    
    if (!encryptedPayload) {
      return res.json({ code: 1, msg: "Payload missing" });
    }

    const decrypted = aesDecrypt(encryptedPayload, aes_key);

    // console.log("decrypted callback",decrypted);
    
    const data = JSON.parse(decrypted || "{}");

    if (!data) {
      return res.json({ code: 1, msg: "Payload decrypt or decode error" });
    }

    /* ================= RAW TRANSACTION ================= */
    const serial_number = data.serial_number || null;
    if (serial_number) {
      const exists = await RawGameTransaction.exists({ serial_number });
      if (!exists) {
        await RawGameTransaction.create({
          serial_number,
          raw_data: data,
        });
      }
    }

    /* ================= FIELDS ================= */
    const player_id = data.member_account || null;
    const game_uid = data.game_uid || null;
    const game_round = data.game_round || null;
    const bet_amount = Number(data.bet_amount || 0);
    const win_amount = Number(data.win_amount || 0);

    /* ================= PREFIX ================= */
    let prefix = null;
    let prefixMember = null;

    // const player_id = hf743aa006543214

    if (player_id && player_id.length >= 9) {
      //  const player_id = hf743aa006543214
      const firstNine = player_id.substring(0, 9);
      prefix = firstNine.substring(6);
      console.log("prefix",prefix);
      
      prefixMember = player_id.substring(9);
      console.log("prefixMember",prefixMember);
      
    }

    if (!serial_number || !player_id || !game_uid) {
      return res.json({ code: 0, msg: "OK, no action (missing fields)" });
    }

    /* ================= PREFIX USER ================= */
    const prefixUser = await User.findOne({ prefix });
    if (!prefixUser || prefixUser.balance <= 0) {
      const payload = aesEncrypt(
        JSON.stringify({
          credit_amount: "0.00",
          timestamp: Date.now().toString(),
        }),
        aes_key
      );

      console.log("prefixUser",prefixUser);
      

      return res.json({
        code: 2,
        msg: prefixUser ? "Low balance (prefix user)" : "Prefix user not found",
        payload,
      });
    }

    /* ================= DAILY FLAG ================= */
    const dailyPrefixes = ["p02"];
    const isdaily = dailyPrefixes.includes(prefix) ? 1 : 0;

    /* ================= GAME TRANSACTIONS ================= */
    if (bet_amount > 0) {
      
      await GameTransaction.create({
        player_id,
        prefix,
        player: prefixMember,
        game_uid,
        game_round,
        serial_number,
        bet_amount,
        win_amount,
        status: win_amount > 0 ? 1 : 0,
        isdaily,
        currency_code,
        callback_time,
      });
    } else if (bet_amount < 0) {
      await GameTransaction.updateOne(
        { player_id, game_round },
        {
          serial_number,
          status: 3,
          callback_time,
        }
      );
    } else {
      const record = await GameTransaction.findOne({
        player_id,
        game_round,
      });

      if (record) {
        console.log("record",record);
        
        const status = win_amount > 0 ? 1 : 2;

        await GameTransaction.updateOne(
          { _id: record._id },
          {
            serial_number,
            win_amount,
            status,
            callback_time,
          }
        );

        // GGR logic hook (optional)
        if (status === 2 && isdaily === 0) {
          await processSingleGGR(prefix, record.bet_amount, win_amount, serial_number);
        }
      }
    }

    /* ================= SUBUSER BALANCE ================= */
    let new_balance = 0;
    const subuser = await SubUser.findOne({ username: player_id });

    if (subuser) {
      const old_balance = subuser.balance;
      new_balance = old_balance - bet_amount + win_amount;

      subuser.balance = new_balance;
      await subuser.save();
    } else {
      new_balance = -bet_amount + win_amount;
    }

    /* ================= RESPONSE ================= */
    const responsePayload = aesEncrypt(
      JSON.stringify({
        credit_amount: new_balance.toFixed(2),
        timestamp: Date.now().toString(),
      }),
      aes_key
    );

    return res.json({
      code: 0,
      msg: "",
      payload: responsePayload,
    });

  } catch (error) {
    console.error("Seamless callback error:", error);
    return res.status(500).json({
      code: 1,
      msg: "Server error",
    });
  }
};


export const processSingleGGR = async (
  prefix,
  betAmount,
  winAmount,
  serialNumber = null
) => {
  const todayDate = moment().format("YYYY-MM-DD");

  // b=100, win - 80
  // ggr = 20
  const ggr = Number(betAmount) - Number(winAmount);

  // 12% default
  // ggrAmount = 20*0.12 = 2.4
 

  // special prefix logic
  // if (prefix === "v02") {
  //   ggrAmount = Number((ggr * 0.1).toFixed(2));
  // }

  const user = await User.findOne({ prefix });
  if (!user){
    return res.json({
      message:"user not fund"
    })
    
  } 

   let ggrAmount = Number((ggr * user.ggr_coust).toFixed(2));

  const balanceBefore = Number(user.balance || 0); // 100
  const duepayBefore = Number(user.duepay || 0); // 90

  const actualDeduction = Math.min(ggrAmount, balanceBefore); // = 2.4
  const remainingDue = Math.max(ggrAmount - actualDeduction, 0);  // 2.4 - 2.4 = 0
  const balanceAfter = balanceBefore - actualDeduction;  // 100 - 2.4 = 97.6

  /* ================= STEP 1: todayggr ================= */
  if (user.ggrupdatedate !== todayDate) {
    user.todayggr = actualDeduction;
    user.ggrupdatedate = todayDate;
  } else {
    user.todayggr = Number(user.todayggr || 0) + actualDeduction;
  }

  /* ================= STEP 2: balance / totalggr / duepay ================= */
  user.balance = Math.max(balanceBefore - actualDeduction, 0);
  user.totalggr = Number(user.totalggr || 0) + actualDeduction;
  user.duepay = duepayBefore + remainingDue;

  await user.save();

  /* ================= STEP 3: GGR LOG ================= */
  await GGRLog.create({
    prefix,
    total_bets: betAmount,
    total_wins: winAmount,
    total_loss: ggr,
    ggr,
    ggr_12_percent: ggrAmount,
    balance_deducted: actualDeduction,
    user_balance_before: balanceBefore,
    user_balance_after: balanceAfter,
    ggr_date: todayDate,
    duepay_added: remainingDue,
  });

  /* ================= STEP 4: UPDATE GAME TRANSACTION ================= */
  if (serialNumber) {
    await GameTransaction.updateOne(
      { serial_number: serialNumber },
      { $set: { ggrstatus: 1 } }
    );
  }
};


export const handleBetLossGGR = async (req = null, res = null) => {

  try {

    /* ================= TIME SETUP ================= */

    const lessTime = moment()
      .tz("Asia/Kolkata")
      .subtract(3, "minutes")
      .toDate();

    const todayDate = moment()
      .tz("Asia/Kolkata")
      .format("YYYY-MM-DD");

    /* ================= AGGREGATE LOSS ================= */

      const ggrData = await GameTransaction.aggregate([
      {
        $match: {
          status: { $in: [0, 2] },
          ggrstatus: 0,
          isdaily: 0,
          callback_time: { $lt: lessTime }
        }
      },
      {
        $group: {
          _id: "$prefix",
          total_loss_bets: { $sum: "$bet_amount" }
        }
      },

      /* ================= JOIN USER ================= */
      {
        $lookup: {
          from: "users", // collection name (important)
          localField: "_id",
          foreignField: "prefix",
          as: "user"
        }
      },
      {
        $unwind: "$user"
      },

      /* ================= CALCULATE DYNAMIC GGR ================= */
      {
        $project: {
          prefix: "$_id",
          total_loss_bets: 1,

          ggr_percent: {
            $divide: ["$user.ggr_coust", 100]
          },

          ggr_amount: {
            $round: [
              {
                $multiply: [
                  "$total_loss_bets",
                  { $divide: ["$user.ggr_coust", 100] }
                ]
              },
              2
            ]
          }
        }
      }
    ]);

    /* ================= PROCESS PREFIX ================= */

    for (const row of ggrData) {

      const prefix = row.prefix;
      const totalLoss = row.total_loss_bets;

      // let ggrAmount = row.ggr_12_percent;
      let ggrAmount = Number(row.ggr_amount || 0);

      // if (prefix === "v02") {
      //   ggrAmount = Number((totalLoss * 0.10).toFixed(2));
      // }

      if (ggrAmount <= 0) continue;


      const user = await User.findOne({ prefix });

      if (!user) continue;


      const balanceBefore = Number(user.balance || 0);
      const duepayBefore = Number(user.duepay || 0);


      const actualDeduction = Math.min(ggrAmount, balanceBefore);
      const remainingDue = Math.max(ggrAmount - actualDeduction, 0);

      const balanceAfter = balanceBefore - actualDeduction;

      if (actualDeduction <= 0 && remainingDue <= 0) continue;


      /* ================= TODAY GGR ================= */

      const userGgrDate = user.ggrupdatedate
        ? moment(user.ggrupdatedate).format("YYYY-MM-DD")
        : null;

      if (userGgrDate !== todayDate) {

        user.todayggr = actualDeduction;
        user.ggrupdatedate = todayDate;

      } else {

        user.todayggr = Number(user.todayggr || 0) + actualDeduction;

      }


      /* ================= USER UPDATE ================= */

      user.balance = Number(Math.max(balanceAfter, 0).toFixed(2));
      user.totalggr = Number(user.totalggr || 0) + actualDeduction;
      user.duepay = duepayBefore + remainingDue;

      await user.save();


      /* ================= GGR LOG ================= */

      await GGRLog.create({
        prefix: prefix,
        total_bets: totalLoss,
        total_wins: 0,
        total_loss: totalLoss,
        ggr: totalLoss,
        ggr_12_percent: ggrAmount,
        balance_deducted: actualDeduction,
        user_balance_before: balanceBefore,
        user_balance_after: balanceAfter,
        ggr_date: todayDate,
        duepay_added: remainingDue
      });

    }


    /* ================= MARK TRANSACTIONS PROCESSED ================= */

    await GameTransaction.updateMany(
      {
        status: { $in: [0, 2] },
        ggrstatus: 0,
        isdaily: 0,
        callback_time: { $lt: lessTime }
      },
      {
        $set: { ggrstatus: 1 },
        // $set: { status: 1 }
      }
    );


    if (res) {

      return res.json({
        status: true,
        message: "Loss GGR processed and user balances updated.",
        details: ggrData
      });

    }

  } catch (error) {

    // console.error("Loss GGR Error:", error);

    if (res) {

      return res.status(500).json({
        status: false,
        message: "Server error"
      });

    }

  }

};

export const updatePendingBetStus = async (req=null, res=null) => {
   try {
    console.log("⏳ Running cron for pending bets...");

    const threeMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    const result = await GameTransaction.updateMany(
      {
        status: 0,
        createdAt: { $lte: threeMinutesAgo }
      },
      {
        $set: { status: 2 }
      }
    );

    // console.log("result",result);
    

    // console.log(`✅ Updated ${result.modifiedCount} records`);
  } catch (error) {
    console.error("❌ Cron error:", error.message);
  }
}

// updatePendingBetStus();

export const getBetHistoryFilter = async (req, res) => {
  try {
    /* ================= VALIDATION ================= */
    const { key, playerid, page = 1, limit = 20, filter } = req.body;

    if (!key) {
      return res.status(422).json({
        status: false,
        message: "key is required",
      });
    }

    const pageNum = Math.max(parseInt(page), 1);
    const limitNum = Math.min(parseInt(limit), 100);
    const skip = (pageNum - 1) * limitNum;

    /* ================= USER ================= */
    const user = await User.findOne({ key });
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    /* ================= BASE QUERY ================= */
    const query = {
      prefix: user.prefix,
    };

    if (playerid) {
      query.player = playerid;
    }

    /* ================= DATE FILTER ================= */
    if (filter) {
      let start, end;

      switch (filter) {
        case "today":
          start = moment().startOf("day");
          end = moment().endOf("day");
          break;

        case "yesterday":
          start = moment().subtract(1, "day").startOf("day");
          end = moment().subtract(1, "day").endOf("day");
          break;

        case "this_week":
          start = moment().startOf("week");
          end = moment().endOf("week");
          break;

        case "this_month":
          start = moment().startOf("month");
          end = moment().endOf("month");
          break;
      }

      if (start && end) {
        query.createdAt = {
          $gte: start.toDate(),
          $lte: end.toDate(),
        };
      }
    }

    /* ================= SUMMARY ================= */
    const summary = await GameTransaction.aggregate([
      { $match: query },
      {
        $lookup: {
          from: "gamelists",
          localField: "game_uid",
          foreignField: "game_uid",
          as: "game",
        },
      },
      { $unwind: "$game" },
      {
        $group: {
          _id: "$game.game_type",
          total_bets: { $sum: 1 },
          total_bet_amount: { $sum: "$bet_amount" },
          total_win_amount: { $sum: "$win_amount" },
        },
      },
      {
        $project: {
          _id: 0,
          game_type: "$_id",
          total_bets: 1,
          total_bet_amount: 1,
          total_win_amount: 1,
        },
      },
    ]);

    /* ================= DATA ================= */
    const records = await GameTransaction.find(query)
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const total = await GameTransaction.countDocuments(query);

    const gameUids = [...new Set(records.map(r => r.game_uid))];
    const games = await GameList.find({ game_uid: { $in: gameUids } }).lean();

    const gameMap = {};
    games.forEach(g => (gameMap[g.game_uid] = g));

    const finalData = records.map(r => ({
      id: r._id,
      player: r.player,
      bet_amount: r.bet_amount,
      win_amount: r.win_amount,
      status: r.status,
      currency_code: r.currency_code,
      created_at: r.createdAt,
      game_name: gameMap[r.game_uid]?.game_name || null,
      game_type: gameMap[r.game_uid]?.game_type || null,
      provider: gameMap[r.game_uid]?.provider || null,
      icon: gameMap[r.game_uid]?.icon || null,
    }));

    return res.json({
      status: true,
      summary,
      data: finalData,
      pagination: {
        total,
        current_page: pageNum,
        per_page: limitNum,
        last_page: Math.ceil(total / limitNum),
      },
    });

  } catch (error) {
    console.error("getBetHistoryFilter error:", error);
    return res.status(500).json({
      status: false,
      message: "Server Error: " + error.message,
    });
  }
};




export const setBalance = async (req, res) => {
  try {
    /* ================= VALIDATION ================= */
    const { key, playerid, opening_balance } = req.body;

    if (!key || !playerid || opening_balance === undefined) {
      return res.status(422).json({
        status: false,
        message: "key, playerid and opening_balance are required",
      });
    }

    /* ================= USER ================= */
    const user = await User.findOne({ key });
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    /* ================= IP VALIDATION ================= */
    const requestIp =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    const allowedIpv4 =(user.ipv4_address || []).map(ip => ip.trim());
    // const allowedIpv6 =
    //   user.ipv6_address?.split(",").map(ip => ip.trim()) || [];

    let ipAllowed = false;

    // IPv6 (/64 → first 4 blocks)
    if (requestIp.includes(":")) {
      const reqPrefix = requestIp
        .toLowerCase()
        .split(":")
        .slice(0, 4)
        .join(":");

      // for (const ipv6 of allowedIpv6) {
      //   const allowedPrefix = ipv6
      //     .toLowerCase()
      //     .split(":")
      //     .slice(0, 4)
      //     .join(":");

      //   if (allowedPrefix === reqPrefix) {
      //     ipAllowed = true;
      //     break;
      //   }
      // }
    } 
    // IPv4 exact match
    else {
      if (allowedIpv4.includes(requestIp)) {
        ipAllowed = true;
      }
    }

    if (!ipAllowed) {
      return res.status(403).json({
        status: false,
        message: "Unauthorized request origin.",
        your_ip: requestIp,
        allowedIpv4List: allowedIpv4,
        // allowedIpv6List: allowedIpv6,
      });
    }

    /* ================= CONFIG ================= */
    const game_uid = "a04d1f3eb8ccec8a4823bdf18e3f0e84";
    const agency_uid = "1b6ad0c8122f6b07955595984682e752";

    const aes_key = Buffer.from(
      "ca51aaabb5e8725f29cd42aa29623b48",
      "utf8" // IMPORTANT
    );

    const timestamp = Date.now().toString();
    const currency_code = "INR";

    /* ================= USERNAME ================= */
    const cleanPlayerId = String(playerid).slice(-7);
    const member_account = `hf743a${user.prefix}${cleanPlayerId}`;

    /* ================= PAYLOAD ================= */
    const payload = aesEncrypt(
      JSON.stringify({
        agency_uid,
        member_account,
        game_uid,
        credit_amount: Number(opening_balance),
        currency_code,
        timestamp,
        transfer_id: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
      }),
      aes_key
    );

    /* ================= PROXY ================= */
    const proxyAgent = new HttpsProxyAgent(
      "http://dgwkmaqa:05xvlisyqip7@64.79.234.241:6765"
    );

    /* ================= API CALL ================= */
    const response = await axios.post(
      "https://huidu.bet/game/v2",
      {
        agency_uid,
        timestamp,
        payload,
      },
      {
        httpsAgent: proxyAgent,
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "identity",
        },
      }
    );

    const responseData = response.data;

    /* ================= SUCCESS ================= */
    if (responseData?.payload) {
      return res.json({
        status: true,
        message: "Balance Get Successfully.",
        BeforeBalance: responseData.payload.before_amount,
        AfterBalance: responseData.payload.after_amount,
      });
    }

    /* ================= FAILURE ================= */
    return res.json({
      status: false,
      message: "Failed to set balance.",
      data: responseData,
    });

  } catch (error) {
    console.error("setBalance error:", error);

    return res.status(500).json({
      status: false,
      message: "Server Error: " + error.message,
    });
  }
};

