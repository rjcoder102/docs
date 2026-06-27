// middlewares/validateGameAccess.js
import cricketAccess from "../models/cricketGameAccess.js";
import User from "../models/UserModel.js"
import UserProviderAccess from "../models/userProviderAccessModel.js";

// const getClientIp = (req) => {
//   return (
//     req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
//     req.socket.remoteAddress
//   );
// };

const getClientIp = (req) => {
  return (
    req.headers["x-real-ip"] ||
    req.socket.remoteAddress
  )?.replace("::ffff:", "");
};


const validateIp = (userIps, requestIp) => {

  if (!userIps || userIps.length === 0) {
    return false;
  }

  return userIps.includes(requestIp);

};

export const validateGameAccess = async (req, res, next) => {
   const { key } = req.query;

    console.log("key",key);
  try {
    /* ===============================
       1️⃣ KEY CHECK
    ================================ */
   
    

    if (!key) {
      return res.status(400).json({
        status: false,
        message: "Key is required",
      });
    }

    /* ===============================
       2️⃣ USER CHECK
    ================================ */
    const user = await User.findOne({ key }).lean();

 
    

    if (!user) {
      return res.status(401).json({
        status: false,
        message: "Invalid key",
      });
    }

    if (user.isActive !== 1) {
      return res.status(403).json({
        status: false,
        message: "User is D-Activate",
      });
    }

  
      /* ===============================
        4️⃣ DOMAIN VALIDATION
    ================================= */

     const requestDomain = req.headers["x-domain"];

    //  console.log("requestDomain",requestDomain);
     

      if (!user.domain) {
        return res.status(403).json({
          status: false,
          message: `Domain is not configured for this user. Contact administrator.`,
        });
      }

      if (!requestDomain || requestDomain !== user.domain) {
        return res.status(403).json({
          status: false,
          message: `Access denied for domain: ${requestDomain}`,
        });
      }

      // console.log("Domain validation passed", requestDomain);

        /* ===============================
          3️⃣ IP VALIDATION
        ================================ */
        const requestIp = getClientIp(req);

        // console.log("requestIp11",requestIp);
        
      if (requestDomain !== "api-docs.space") {

        if (!user.ipv4_address) {
          return res.status(403).json({
            status: false,
            message: `Your IP address is ${requestIp}, Access has been banned by the system, please contact the administrator to add a whitelist!`,
          });
        }

        if (!validateIp(user.ipv4_address, requestIp)) {
          return res.status(403).json({
            status: false,
            message: `Your IP address ${requestIp} is not whitelisted`,
          });
        }
     }


    /* ===============================
       4️⃣ PROVIDER ACCESS
    ================================ */
    const providerAccess = await UserProviderAccess.findOne({
      userId: user._id,
    }).lean();


    

    if (!providerAccess) {
      return res.status(403).json({
        status: false,
        message: "No provider access found",
      });
    }

    const allowedProviders = providerAccess.providers
      .filter(p => p.status === 1)
      .map(p => p.name);

    //   console.log("allowedProviders",allowedProviders);
      

    if (!allowedProviders.length) {
      return res.status(403).json({
        status: false,
        message: "No active provider access",
      });
    }

    /* ===============================
       5️⃣ ATTACH DATA TO REQUEST
    ================================ */
    req.user = user;
    req.allowedProviders = allowedProviders;
    req.clientIp = requestIp;

    next();

  } catch (error) {
    console.error("validateGameAccess error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const lunchGameValidate = async (req, res, next) => {
  try {
    /* ===============================
       1️⃣ KEY CHECK
    ================================ */
    const { key,playerid } = req.query;

    console.log("key11",key);
    

    if (!key) {
      return res.status(400).json({
        status: false,
        message: "Key is required1111",
      });
    }

    /* ===============================
       2️⃣ USER CHECK
    ================================ */
    const user = await User.findOne({ key }).lean();

    // console.log("user",user);
    

    if (!user) {
      return res.status(401).json({
        status: false,
        message: "Invalid key",
      });
    }

    if (user.isActive !== 1) {
      return res.status(403).json({
        status: false,
        message: "User is not active",
      });
    }


      /* ===============================
        4️⃣ DOMAIN VALIDATION
    ================================= */

       const requestDomain = req.headers["x-domain"];

      if (!user.domain) {
        return res.status(403).json({
          status: false,
          message: `Domain is not configured for this user. Contact administrator.`,
        });
      }

      if (!requestDomain || requestDomain !== user.domain) {
        return res.status(403).json({
          status: false,
          message: `Access denied for domain: ${requestDomain}`,
        });
      }


    /* ===============================
       3️⃣ IP VALIDATION
    ================================ */
    const requestIp = getClientIp(req);

    console.log("requestIp22",requestIp);
    

    if (!validateIp(user.ipv4_address, requestIp)) {
        return res.status(403).json({
          status:false,
          message:`Your IP address ${requestIp} is not whitelisted`
        });
      }

  // if (user.balance)

    /* ===============================
       5️⃣ ATTACH DATA TO REQUEST
    ================================ */
    req.user = user;
    req.clientIp = requestIp;
    next();

  } catch (error) {
    console.error("validateGameAccess error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};

export const cricketGameValidate = async (req, res, next) => {
  
  console.log("key",req.query);
  try {
    const { key } = req.query;
    /* ===============================
       1️⃣ KEY CHECK
    ================================ */
  
    

    if (!key) {
      return res.status(400).json({
        status: false,
        message: "Key is required11",
      });
    }

    /* ===============================
       2️⃣ USER CHECK
    ================================ */
    const user = await User.findOne({ key }).lean();

    // console.log("user",user);
    

    if (!user) {
      return res.status(401).json({
        status: false,
        message: "Invalid key",
      });
    }

    if (user.isActive !== 1) {
      return res.status(403).json({
        status: false,
        message: "User is not active",
      });
    }
    if (user.cricketBalence === 0) {
      return res.status(403).json({
        status: false,
        message: "Your plane experi",
      });
    }

      /* ===============================
        4️⃣ DOMAIN VALIDATION
    ================================= */

       const requestDomain = req.headers["x-domain"];
      console.log(requestDomain);

      if (!user.domain) {
        return res.status(403).json({
          status: false,
          message: `Domain is not configured for this user. Contact administrator.`,
        });
      }

      if (!requestDomain || requestDomain !== user.domain) {
        return res.status(403).json({
          status: false,
          message: `Access denied for domain: ${requestDomain}`,
        });
      }


    /* ===============================
       3️⃣ IP VALIDATION
    ================================ */
    const requestIp = getClientIp(req);

    console.log("requestIp33",requestIp);
    
    

    if (!user.ipv4_address) {
      return res.status(403).json({
        status: false,
        message: `Your IP address is ${[requestIp]}, Access has been banned by the system, please contact the administrator to add a whitelist!`,
      });
    }
    if (!validateIp(user.ipv4_address, requestIp)) {
        return res.status(403).json({
          status:false,
          message:`Your IP address ${requestIp} is not whitelisted`
        });
      }

     const providerAccess = await cricketAccess.findOne({
      userId: user._id,
    }).lean();


    

    if (!providerAccess) {
      return res.status(403).json({
        status: false,
        message: "No provider access found",
      });
    }

    if (providerAccess.isActive ===0) {
      return res.status(403).json({
        status: false,
        message: "Cricket Provider Not active Your plane is expired",
      });
    }


    /* ===============================
       5️⃣ ATTACH DATA TO REQUEST
    ================================ */
    req.user = user;
    req.clientIp = requestIp;
    next();

  } catch (error) {
    console.error("validateGameAccess error:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
    });
  }
};
