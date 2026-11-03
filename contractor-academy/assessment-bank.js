const academyAssessments = {
  "1": [
    {
      "q": "A resident asks for interior oven cleaning after you arrive for a standard visit. What can you tell them today?",
      "a": [
        "You can relay the request to Turnly and continue the booked clean.",
        "You can include it if the remaining appointment time allows.",
        "You can trade it for another task of similar duration.",
        "You can confirm the extra now and have Turnly price it later."
      ],
      "correct": 0,
      "why": "Available time does not establish scope or price. Turnly handles the booking decision."
    },
    {
      "q": "A manager wants to know if a unit is ready while you still have a floor edge to check. What is the most accurate reply?",
      "a": [
        "Say what is finished and when you expect to verify the remaining edge.",
        "Confirm it is ready because all cleaning passes are finished.",
        "Send the completed-room photos as confirmation for the whole unit.",
        "Mark it complete now and mention the edge only if it needs work."
      ],
      "correct": 0,
      "why": "Readiness includes verification. Give the manager a useful update without overstating completion."
    },
    {
      "q": "A resident is working at a desk that appears on your cleaning route. What should you do?",
      "a": [
        "Ask when the surface is accessible and clean another assigned area meanwhile.",
        "Move the laptop to the nearest chair and replace it after wiping.",
        "Wipe around the resident without interrupting to discuss access.",
        "Mark the desk complete based on the clear section you can see."
      ],
      "correct": 0,
      "why": "Respect the resident's use of the space and distinguish accessible work from deferred work."
    },
    {
      "q": "A resident points out a scratch while you are preparing to clean a vanity. What is the best response?",
      "a": [
        "Note its location and condition, protect it and communicate the concern.",
        "Polish it before reporting so you can say whether it is removable.",
        "Assure the resident the previous service caused it.",
        "Finish the vanity normally and report only if the scratch gets worse."
      ],
      "correct": 0,
      "why": "Describe what you observed without guessing at cause or trying an unauthorized repair."
    },
    {
      "q": "Tomorrow's accepted job has a different access window than you expected. What should you do now?",
      "a": [
        "Raise the conflict through Turnly while there is time to resolve it.",
        "Arrive at the time used on your previous visit to that property.",
        "Ask the resident to move the appointment without updating Turnly.",
        "Wait until the window opens to see if the conflict still matters."
      ],
      "correct": 0,
      "why": "Reviewing accepted obligations early gives operations time to address a real scheduling conflict."
    },
    {
      "q": "The supplied code fails at the correct unit. Which update best helps operations?",
      "a": [
        "State the unit, that authorized entry failed and that work has not begun.",
        "Mark the job started and note that you are waiting outside.",
        "Record the visit as complete because you attempted access.",
        "Try the code from an earlier job before reporting the failure."
      ],
      "correct": 0,
      "why": "An access attempt is not entry or service. A precise update lets operations verify the next step."
    },
    {
      "q": "A resident wants you to use their phone number from the work order for an unrelated referral. What is appropriate?",
      "a": [
        "Keep the number within its authorized service use and refer the request through Turnly.",
        "Save it in your personal contacts and follow up after closeout.",
        "Give the number to the referral partner but omit the unit number.",
        "Use it once for the referral and delete the message afterward."
      ],
      "correct": 0,
      "why": "Access to customer details for a job does not grant permission for unrelated business use."
    },
    {
      "q": "A Turnly customer asks to book their next clean directly with you. What is the best reply?",
      "a": [
        "Direct them to Turnly to arrange the next booking.",
        "Offer a private rate only for work outside today's checklist.",
        "Accept a tentative date but delay taking payment.",
        "Take their details and finalize the arrangement after this job closes."
      ],
      "correct": 0,
      "why": "Future service for a Turnly-originated customer goes through the authorized booking process."
    },
    {
      "q": "A stain appears beyond routine scope. You need guidance but have no photo. What should you do?",
      "a": [
        "Message Turnly with the surface, condition and task affected.",
        "Wait to ask until you can submit a formal photo approval.",
        "Try a stronger treatment so the message includes a result.",
        "Finish the job and omit the stain because it was outside scope."
      ],
      "correct": 0,
      "why": "A clear description can start a scope discussion. Routine evidence requirements serve a different purpose."
    },
    {
      "q": "At closeout one assigned shelf was inaccessible. Which record is most useful?",
      "a": [
        "List what you completed, identify the blocked shelf and report why.",
        "Check off the room because every accessible shelf was cleaned.",
        "Leave the whole room unchecked without explanation.",
        "Mark the shelf complete and plan to clean it next visit."
      ],
      "correct": 0,
      "why": "Accurate closeout distinguishes completed work from a specific unresolved item."
    }
  ],
  "2": [
    {
      "q": "The label gives separate directions for routine cleaning and disinfection. The checklist requires disinfection. Which directions control?",
      "a": [
        "Use the labeled disinfection dilution and wet contact time for that surface.",
        "Use the routine dilution and leave it for the disinfection time.",
        "Use the disinfection dilution and wipe as soon as the soil lifts.",
        "Use the routine method twice to match the stronger treatment."
      ],
      "correct": 0,
      "why": "Concentration and contact time are both part of the labeled disinfection method."
    },
    {
      "q": "A product splashes during setup. Where should you look for product-specific first-aid information?",
      "a": [
        "The product label and the matching Safety Data Sheet.",
        "The checklist for the room where the splash occurred.",
        "The directions for another product with the same scent.",
        "The manufacturer's general product catalog."
      ],
      "correct": 0,
      "why": "The label and matching SDS identify product-specific precautions and first-aid instructions."
    },
    {
      "q": "An earlier worker applied an unknown cleaner to a fixture. You planned to use bleach there. What should you do?",
      "a": [
        "Hold the bleach treatment until the previous product and safe method are verified.",
        "Wipe until the fixture looks dry, then apply bleach.",
        "Dilute the bleach further before treating the fixture.",
        "Test a small spot and proceed if there is no visible reaction."
      ],
      "correct": 0,
      "why": "A dry appearance, dilution or spot test does not establish chemical compatibility."
    },
    {
      "q": "A coworker suggests adding ammonia cleaner to a bleach bucket for stubborn soil. What is your best response?",
      "a": [
        "Keep the products separate and select a single approved method for the soil.",
        "Use less of each and shorten the treatment.",
        "Apply the two products one after the other while the surface is wet.",
        "Use the mixture only with the room fan running."
      ],
      "correct": 0,
      "why": "Bleach and ammonia can release toxic gases. Ventilation does not make mixing safe."
    },
    {
      "q": "The label requires ventilation you cannot provide in a windowless room. What should you do?",
      "a": [
        "Pause that product's use and arrange a permitted method for the conditions.",
        "Wear a dust mask and reduce the contact time.",
        "Keep the door ajar briefly after the treatment.",
        "Use half the labeled amount to reduce vapor."
      ],
      "correct": 0,
      "why": "Required ventilation must be available during use. A dust mask does not provide chemical vapor protection."
    },
    {
      "q": "A loaded supply bin is awkward to lift from floor level. Which adjustment reduces the handling risk?",
      "a": [
        "Split the load and clear the route before moving it.",
        "Hold the whole bin farther from your body for balance.",
        "Twist at the waist so you can set it down in one motion.",
        "Carry it faster to reduce the time spent lifting."
      ],
      "correct": 0,
      "why": "Manage the load and route before lifting instead of compensating with awkward posture."
    },
    {
      "q": "You see a needle protruding from a trash bag. What is the safest next action?",
      "a": [
        "Stop handling the bag, keep people clear and arrange qualified sharps disposal.",
        "Grip the bag above the needle and move it to the trash room.",
        "Use the vacuum hose to extract the needle without touching it.",
        "Put a second ordinary bag around it before carrying it out."
      ],
      "correct": 0,
      "why": "Do not compress, transfer or discard the bag as ordinary waste. Document and report the hazard."
    },
    {
      "q": "A powered floor tool's cord has a damaged section near a wet threshold. What should you do?",
      "a": [
        "Keep people clear, stop use and arrange safe removal or replacement.",
        "Dry the threshold and use the tool only on that side.",
        "Tape over the damage and inspect it again at closeout.",
        "Ask a second worker to hold the cord above the wet area."
      ],
      "correct": 0,
      "why": "A dry patch or improvised covering does not resolve a damaged electrical cord."
    },
    {
      "q": "A person develops breathing difficulty after a chemical release. What takes priority?",
      "a": [
        "Get to safety and seek emergency help promptly.",
        "Identify the exact product before calling for help.",
        "Collect photos of the spill before leaving the area.",
        "Finish rinsing the surface to stop the odor at its source."
      ],
      "correct": 0,
      "why": "Immediate safety and emergency response come before investigation or cleanup."
    },
    {
      "q": "You have secured a wet-floor hazard after a visitor slipped. What should your incident report include?",
      "a": [
        "The time, location, observed condition and actions taken.",
        "Your best estimate of who caused the spill and why.",
        "Only whether the visitor continued walking afterward.",
        "A statement that the floor was safe because a sign was present."
      ],
      "correct": 0,
      "why": "Factual observations and actions support follow-up without guessing about fault or injury."
    }
  ],
  "3": [
    {
      "q": "You are packing for a turnover with assigned drawer interiors and hard floors. Which kit check matters most?",
      "a": [
        "Match the tools to both tasks and verify they are clean and serviceable.",
        "Pack the kit from the last turnover because the service category matches.",
        "Take the floor tools and rely on the property for drawer supplies.",
        "Pack every available product and decide on compatibility at the unit."
      ],
      "correct": 0,
      "why": "Readiness depends on the actual tasks, finishes and condition of the equipment."
    },
    {
      "q": "Halfway through a job you expect to run out of clean kitchen cloths. How should you prepare?",
      "a": [
        "Bring enough clean kitchen cloths and a separate place for used ones.",
        "Plan to rinse and reuse the bathroom cloths in the kitchen.",
        "Keep a single cloth for the whole kitchen regardless of soil.",
        "Use disposable packaging as a backup wiping material."
      ],
      "correct": 0,
      "why": "Plan both clean supply and used-tool storage to avoid cross-contamination."
    },
    {
      "q": "A counter resembles quartz but may be natural stone. What should govern product choice?",
      "a": [
        "Confirm the material and use an approved compatible product.",
        "Use the descaler that worked on nearby ceramic tile.",
        "Use an abrasive pad because the counter feels hard.",
        "Choose a product by the color of the stone."
      ],
      "correct": 0,
      "why": "A similar appearance does not establish resistance to acids or abrasives."
    },
    {
      "q": "A laminate floor has visible grit at the seams. What is the best preparation?",
      "a": [
        "Remove the grit dry, then use a compatible low-moisture method.",
        "Soak the seams so the grit floats free.",
        "Use a steam setting approved for a different hard floor.",
        "Start with a wet pad and increase pressure at the seams."
      ],
      "correct": 0,
      "why": "Dry removal limits abrasion and controlled moisture protects vulnerable seams."
    },
    {
      "q": "The last unused cloth is from the toilet-only set. The kitchen still needs wiping. What should you do?",
      "a": [
        "Get a clean kitchen-designated cloth before continuing there.",
        "Use the toilet cloth because it has not been used on this job.",
        "Use the reverse side and return it to the toilet set afterward.",
        "Remove the color tag and reassign it for the rest of the visit."
      ],
      "correct": 0,
      "why": "Dedicated groups prevent tools from crossing contamination zones."
    },
    {
      "q": "A used bathroom cloth lands in the open container of clean cloths. What is the best response?",
      "a": [
        "Separate the affected supplies for laundering and obtain clean replacements.",
        "Remove just the bathroom cloth and keep using everything underneath.",
        "Spray the upper layer and treat the container as ready.",
        "Reserve the exposed cloths for the kitchen floor only."
      ],
      "correct": 0,
      "why": "A clean container loses its protective function when used tools contact its contents."
    },
    {
      "q": "A vacuum head has a rough exposed edge. The floor is polished wood. What should you do?",
      "a": [
        "Remove the head from use and obtain a safe compatible tool.",
        "Use it only along baseboards where scratches are less visible.",
        "Wrap the edge in a cloth and proceed at low suction.",
        "Test it in the middle of the room before switching attachments."
      ],
      "correct": 0,
      "why": "Damaged contact surfaces can scratch the finish even when suction is reduced."
    },
    {
      "q": "You find a loose needle while inspecting the floor before vacuuming. What should you do?",
      "a": [
        "Keep people away and arrange trained, properly equipped removal.",
        "Cover it with a towel so the vacuum can pass around it.",
        "Use the hose to move it into an empty dust bin.",
        "Sweep it into a dustpan and carry it to ordinary trash."
      ],
      "correct": 0,
      "why": "Do not improvise sharps handling. Report the location and follow the sharps procedure."
    },
    {
      "q": "Your only spare cleaner is in an unlabeled bottle. What should you do?",
      "a": [
        "Set it aside and obtain an identified, approved replacement.",
        "Identify it by odor and use it only on a small area.",
        "Match the liquid color to a labeled product in the cart.",
        "Use it only for floors where a finish change is less obvious."
      ],
      "correct": 0,
      "why": "Without identification you cannot verify hazards, dilution or compatibility."
    },
    {
      "q": "A customer asks you to remove hardened residue with a tool your kit lacks. What is the best response?",
      "a": [
        "Describe the condition to Turnly and continue safe assigned work.",
        "Substitute a sharper general-purpose tool and reduce pressure.",
        "Borrow the resident's tool and treat that as authorization.",
        "Promise removal on this visit before checking the finish."
      ],
      "correct": 0,
      "why": "A missing specialist tool can signal a scope or compatibility issue that needs clarification."
    }
  ],
  "4": [
    {
      "q": "The work order lists one add-on, but the resident describes a different priority during the walkthrough. What should you confirm?",
      "a": [
        "Which work is authorized before changing the planned scope.",
        "Which task can be completed fastest within the same time.",
        "Which task the resident most recently mentioned.",
        "Which add-on was performed on the previous visit."
      ],
      "correct": 0,
      "why": "The walkthrough identifies priorities and discrepancies without silently rewriting the booking."
    },
    {
      "q": "You discover a damaged fixture and heavy buildup in another room during arrival. What should you communicate?",
      "a": [
        "The locations, observed conditions and likely effect on assigned work.",
        "A single estimate for replacing the fixture and restoring the room.",
        "That the entire property cannot be serviced until repairs finish.",
        "That both issues will be resolved within the original appointment."
      ],
      "correct": 0,
      "why": "Separate damage from cleaning scope and identify where safe work can continue."
    },
    {
      "q": "A shelf above a gritty floor needs dusting. Which sequence minimizes rework?",
      "a": [
        "Dust the reachable shelf, remove fallen dry debris, then wet-clean the floor.",
        "Wet-clean the floor, dust the shelf, then dry-buff the center.",
        "Wet the grit before dusting so it stays in place.",
        "Dust the shelf after the final floor inspection."
      ],
      "correct": 0,
      "why": "Higher surfaces can shed debris. Wetting loose grit first can spread it."
    },
    {
      "q": "An unknown powder lies below a damaged wall. Does dry-before-wet apply here?",
      "a": [
        "Isolate the area and report it before disturbing the material.",
        "Vacuum it dry because loose material comes first.",
        "Mist it lightly and wipe it up to avoid airborne dust.",
        "Move it into one pile so work elsewhere can proceed."
      ],
      "correct": 0,
      "why": "The dry-first sequence is for ordinary debris, not suspected hazardous material."
    },
    {
      "q": "A disinfectant needs several minutes of wet contact. What is a good use of that interval?",
      "a": [
        "Work on a separate suitable task while monitoring the treated surface.",
        "Dry the surface early if it looks visibly clean.",
        "Add extra concentrate to shorten the waiting time.",
        "Move on permanently once the timer starts."
      ],
      "correct": 0,
      "why": "Plan around label contact time and verify that the surface stays wet as directed."
    },
    {
      "q": "A general cleaner removed all visible soil from a required disinfection surface. What remains?",
      "a": [
        "Apply the approved disinfectant according to its label.",
        "Repeat the cleaner application and call it disinfected.",
        "Buff the surface until there are no visible streaks.",
        "Treat a clean appearance as evidence of disinfection."
      ],
      "correct": 0,
      "why": "Cleaning removes soil. A disinfection claim requires a suitable product and method."
    },
    {
      "q": "Your cart blocks the only exit while two rooms are being serviced. How should you adjust?",
      "a": [
        "Move the cart to a safe staging point and plan the floor route toward the exit.",
        "Finish the nearest room quickly before relocating the cart.",
        "Mop the exit first so you can keep the cart where it is.",
        "Split the load across the doorway to leave a narrow passage."
      ],
      "correct": 0,
      "why": "An efficient route preserves access and avoids walking back over finished floors."
    },
    {
      "q": "A long hallway connects two dirty rooms to the exit. When should you do its final mop?",
      "a": [
        "After room work that uses the hallway, progressing toward the exit.",
        "Before staging supplies so everyone starts on a clean floor.",
        "Between rooms even if the cart must cross it afterward.",
        "At the start, then spot-dry a path for equipment."
      ],
      "correct": 0,
      "why": "Final floor work should follow traffic-generating tasks to prevent repeat passes."
    },
    {
      "q": "At final inspection the sink looks bright but grit remains around the drain rim. What should you do?",
      "a": [
        "Correct the rim, recheck it and then complete the checklist.",
        "Mark the sink complete because its largest surface is clean.",
        "Note the grit as a future deep-clean task without examining it.",
        "Take a photo from farther back and proceed to closeout."
      ],
      "correct": 0,
      "why": "An ordinary reachable miss should be corrected before completion."
    },
    {
      "q": "You accidentally damage trim during the final pass. What is the responsible closeout?",
      "a": [
        "Report the location and observed damage promptly through Turnly.",
        "Touch up the trim yourself before deciding whether to report.",
        "Wait for the resident to discover it and request a review.",
        "Record the cleaning as complete with no note because the surface is clean."
      ],
      "correct": 0,
      "why": "A clean surface and accidental damage are separate facts that both matter to closeout."
    }
  ],
  "5": [
    {
      "q": "A countertop is partly covered by medication and paperwork. How should you begin?",
      "a": [
        "Confirm what may be moved and clean safely accessible sections.",
        "Move everything onto one tray so the counter can be fully wiped.",
        "Photograph the documents to help replace them precisely.",
        "Slide the items into a drawer until the cleaner dries."
      ],
      "correct": 0,
      "why": "Kitchen scope does not grant general permission to move sensitive belongings."
    },
    {
      "q": "Two adjoining counters look similar but one is natural stone. Which preparation is best?",
      "a": [
        "Identify each material and choose a compatible method for each section.",
        "Use the backsplash product on both because the color matches.",
        "Use the stronger product on both but reduce the contact time.",
        "Polish both first and check for finish changes afterward."
      ],
      "correct": 0,
      "why": "Adjacent surfaces may require different products despite matching visually."
    },
    {
      "q": "An assigned empty cabinet has crumbs at the rear seam. What sequence is best?",
      "a": [
        "Remove dry debris, wipe the shelf and seam, then check the handle.",
        "Wet the shelf first and push the softened crumbs toward the seam.",
        "Wipe the front and handle because they indicate interior cleanliness.",
        "Polish the shelf before collecting loose crumbs."
      ],
      "correct": 0,
      "why": "Removing debris before wiping prevents it from being smeared into corners."
    },
    {
      "q": "Grease remains on a glossy cabinet front after the first pass. What should you try next?",
      "a": [
        "Use the approved finish-safe method and a non-scratching tool.",
        "Switch to an abrasive pad and work only along the grain.",
        "Use oven cleaner because the residue came from cooking.",
        "Rub the spot dry with increasing pressure until it loses its shine."
      ],
      "correct": 0,
      "why": "The treatment must remove grease without changing the cabinet finish."
    },
    {
      "q": "The microwave interior is included. Residue remains around the turntable after wiping. What should guide the next step?",
      "a": [
        "Check permitted component removal and clean the reachable recess safely.",
        "Run the microwave briefly to confirm the plate spins through the residue.",
        "Remove fixed panels to reach hidden edges during routine service.",
        "Apply the stovetop degreaser before checking microwave compatibility."
      ],
      "correct": 0,
      "why": "Authorized access and manufacturer-compatible methods govern appliance detailing."
    },
    {
      "q": "A hood makes an unusual electrical noise reported by the resident. What should you do?",
      "a": [
        "Report the malfunction and avoid operating it to test the sound.",
        "Run it on low to decide if the sound affects cleaning.",
        "Switch it on after degreasing to check whether the noise clears.",
        "Test all speeds before documenting the issue."
      ],
      "correct": 0,
      "why": "Testing a malfunctioning appliance introduces risk outside the cleaning task."
    },
    {
      "q": "You are cleaning an occupied home and the refrigerator interior is full. The booking lists appliance exteriors. What should you do?",
      "a": [
        "Service the exterior and clarify any request for interior work.",
        "Transfer food to the counter and clean one shelf at a time.",
        "Clean the interior only where no food needs to be moved.",
        "Treat the refrigerator interior as included because the door is accessible."
      ],
      "correct": 0,
      "why": "An exterior booking does not authorize interior service or moving food."
    },
    {
      "q": "During an assigned interior appliance clean you discover an active leak. What is the best next step?",
      "a": [
        "Stop the affected task, report the leak and continue other safe work.",
        "Finish drying the interior before reporting the leak.",
        "Run the appliance to locate the leak for the manager.",
        "Mark the interior complete once the visible water is wiped away."
      ],
      "correct": 0,
      "why": "A leak changes the safety and completion status of the affected work."
    },
    {
      "q": "Stainless steel looks clear head-on but shows streaks from the side. What should you do?",
      "a": [
        "Correct the finish with a compatible method and inspect from both angles.",
        "Sign it off from the angle used for the completion photo.",
        "Apply more product over the whole surface without checking residue.",
        "Leave the streaks because they disappear under overhead lighting."
      ],
      "correct": 0,
      "why": "Changing the viewing angle reveals residue a single inspection can miss."
    },
    {
      "q": "The kitchen counter is spotless. Which final pass best checks the rest of the assigned work?",
      "a": [
        "Inspect faucet base, drain rim, backsplash seams, handles and floor edges.",
        "Check the counter from three angles and inspect only obvious spills.",
        "Verify the room smells clean and confirm the equipment is packed.",
        "Check appliance fronts and assume adjacent handles were wiped too."
      ],
      "correct": 0,
      "why": "A finished counter does not verify touch points, seams or floor corners."
    }
  ],
  "6": [
    {
      "q": "You finish the toilet and notice toothpaste on the vanity. What should happen before you clean the vanity?",
      "a": [
        "Change gloves and switch to clean vanity supplies.",
        "Rinse the toilet cloth and fold it to a dry side.",
        "Switch cloths but keep the gloves used on the toilet.",
        "Wipe the vanity with a dry towel before changing gloves."
      ],
      "correct": 0,
      "why": "Hands, gloves and tools can carry contamination between zones."
    },
    {
      "q": "There is loose hair around the sink and tub. Which opening sequence makes the wet work easier?",
      "a": [
        "Collect loose hair first, then clean the surfaces by zone.",
        "Wet both surfaces so the strands collect near the drain.",
        "Spray the surfaces and pick up hair after polishing.",
        "Use the floor mop to gather hair from the tub first."
      ],
      "correct": 0,
      "why": "Removing loose material before applying liquid avoids spreading it."
    },
    {
      "q": "A toilet handle looks clean after wiping. The disinfectant label requires a wet contact time. When is the step complete?",
      "a": [
        "After the surface stays wet for the full labeled interval.",
        "As soon as there are no visible marks on the handle.",
        "After a second coat is applied and immediately dried.",
        "Once the same interval has passed since the bottle was opened."
      ],
      "correct": 0,
      "why": "Contact time measures time wet on the surface, not time spent in the room."
    },
    {
      "q": "The bowl is clean, but the seat hinges have visible soil. What should you do?",
      "a": [
        "Clean the hinges with toilet-only tools, then disinfect as directed.",
        "Apply disinfectant over the soil and leave the hinges untouched.",
        "Use the vanity polishing cloth to reach the hinges.",
        "Repeat the bowl treatment so the entire toilet counts as serviced."
      ],
      "correct": 0,
      "why": "A clean bowl does not address soil at the hinges or other touch points."
    },
    {
      "q": "A shower-door track still has grit after the glass is clean. What is the best next step?",
      "a": [
        "Detail the reachable track with a finish-safe tool and remove the residue.",
        "Polish the glass again so runoff flushes the track.",
        "Apply descaler to the dry grit before checking the finish.",
        "Leave the track for the floor-cleaning step."
      ],
      "correct": 0,
      "why": "Door tracks collect debris separately from glass and need their own inspection."
    },
    {
      "q": "A cloudy patch persists on a tub whose finish you cannot identify. What should you do before trying a stronger treatment?",
      "a": [
        "Verify the finish and approved treatment before escalating.",
        "Increase the concentration of the product that worked on tile.",
        "Try an abrasive pad on the most visible part of the patch.",
        "Apply a mineral remover because cloudiness identifies scale."
      ],
      "correct": 0,
      "why": "Appearance alone does not identify the deposit or establish product compatibility."
    },
    {
      "q": "A mirror looks clear head-on but has streaks under the side light. How do you resolve them?",
      "a": [
        "Buff with a clean suitable cloth and recheck from the side.",
        "Mist the whole mirror again and leave it to air-dry.",
        "Inspect only from the doorway where customers enter.",
        "Polish the faucet instead because it reflects onto the mirror."
      ],
      "correct": 0,
      "why": "Side lighting reveals film that a front view can hide."
    },
    {
      "q": "The vanity counter is clean but water spots remain around the faucet base. Which finish check is best?",
      "a": [
        "Clean and dry the base, then inspect from more than one angle.",
        "Dry the top of the spout and check the mirror reflection.",
        "Run water over the spots and inspect while the metal is wet.",
        "Polish only the handles because those are the touch surfaces."
      ],
      "correct": 0,
      "why": "Wet metal and a single viewing angle can conceal spots at fixture bases."
    },
    {
      "q": "You are at the bathroom door after mopping and see hair behind it. What should you do?",
      "a": [
        "Remove the hair, touch up that area and recheck the floor.",
        "Move the door over it and inspect the exposed floor only.",
        "Make another full wet pass without collecting the hair.",
        "Record the corner as clean because the mop reached it."
      ],
      "correct": 0,
      "why": "A completed pass is not proof that a corner is free of debris."
    },
    {
      "q": "Which finding warrants another cleaning pass before bathroom sign-off?",
      "a": [
        "A removable ring remains at the sink drain under good lighting.",
        "An old chip is documented and the surrounding surface is clean.",
        "A verified permanent discoloration remains after approved care.",
        "A previously reported crack is unchanged and free of soil."
      ],
      "correct": 0,
      "why": "Distinguish removable residue from documented damage or permanent wear."
    }
  ],
  "7": [
    {
      "q": "An occupied bedroom door is closed and the notes restrict entry. What do you do?",
      "a": [
        "Leave it closed and clean the authorized areas.",
        "Open it briefly to check whether the floor needs work.",
        "Clean just inside the threshold without moving belongings.",
        "Enter after finishing the rest of the home if time allows."
      ],
      "correct": 0,
      "why": "A room restriction governs entry even when the door is unlocked."
    },
    {
      "q": "Small personal items cover a shelf. What is the best way to handle the dust?",
      "a": [
        "Clean safely accessible areas and follow instructions about moving items.",
        "Group the items by size to create a clear wiping path.",
        "Move everything onto the bed and replace it from memory.",
        "Photograph the possessions so you can rearrange them afterward."
      ],
      "correct": 0,
      "why": "Cleaning an occupied room must respect belongings and privacy."
    },
    {
      "q": "Dust remains on the top door trim above a freshly cleaned floor. How should you finish?",
      "a": [
        "Dust the reachable trim, then recheck the floor below.",
        "Mop first, then dust the trim with the same mop pad.",
        "Dust the lower trim only so no debris falls on the floor.",
        "Wet the floor below the door before dry dusting."
      ],
      "correct": 0,
      "why": "High surfaces can redeposit debris on lower surfaces already cleaned."
    },
    {
      "q": "A ceiling fixture is out of safe reach. What is the best decision?",
      "a": [
        "Use approved reach equipment if safe, or report the limitation.",
        "Stand on a sturdy-looking chair and keep one hand on the wall.",
        "Pull the fixture lower by its decorative parts.",
        "Wet the duster so it can flick debris from a distance."
      ],
      "correct": 0,
      "why": "A high-dusting task does not authorize improvised access or unsafe contact."
    },
    {
      "q": "You find an antique side table with an unfamiliar finish. How should you proceed?",
      "a": [
        "Verify approved care before applying product to the finish.",
        "Use the furniture polish that worked on the adjacent table.",
        "Apply cleaner directly so the cloth does not scratch it.",
        "Use a damp upholstery tool on the whole tabletop."
      ],
      "correct": 0,
      "why": "Similar-looking furniture may require different finish care."
    },
    {
      "q": "A cushion has a stain, but the job includes routine vacuuming only. What is appropriate?",
      "a": [
        "Vacuum as permitted and flag the stain for scope clarification.",
        "Wet-treat the stain with carpet solution during vacuuming.",
        "Turn the cushion over so the stain is less noticeable.",
        "Scrub it with the floor brush before vacuuming."
      ],
      "correct": 0,
      "why": "Routine soft-surface care does not establish approval for stain treatment."
    },
    {
      "q": "Grit covers a hard floor beside carpet. How should you begin?",
      "a": [
        "Remove dry debris with suitable tools before wet-cleaning the hard floor.",
        "Wet-mop both surfaces along the transition to catch grit.",
        "Mop the hard floor first and vacuum grit once it dries.",
        "Sweep grit into the carpet so it can be collected later."
      ],
      "correct": 0,
      "why": "Loose grit can spread or scratch when dragged through a wet pass."
    },
    {
      "q": "The hard floor is clean but the carpet edge still has crumbs. Which check was missed?",
      "a": [
        "Inspect transitions and use an appropriate edge tool.",
        "Increase moisture on the hard-floor side of the threshold.",
        "Vacuum the carpet center again at a slower pace.",
        "Polish the threshold until its surface reflects light."
      ],
      "correct": 0,
      "why": "A room-center pass may miss edges where floor types meet."
    },
    {
      "q": "A floor looks clean under ceiling lights but streaked in daylight. What should you do?",
      "a": [
        "Correct the streaks and inspect again under both lighting conditions.",
        "Close the blinds and inspect only under ceiling lights.",
        "Mark it complete if the streaks disappear from the doorway.",
        "Apply more product across the floor before checking the cause."
      ],
      "correct": 0,
      "why": "A final walkthrough should reveal residue from different viewing angles."
    },
    {
      "q": "At closeout, a chair you moved is blocking the doorway. What should you do?",
      "a": [
        "Restore its authorized position and verify a clear path.",
        "Leave it there to show the floor underneath was cleaned.",
        "Move it against another resident's furniture for presentation.",
        "Rearrange the room to make the doorway look wider."
      ],
      "correct": 0,
      "why": "Presentation includes restoring belongings and leaving safe travel paths."
    }
  ],
  "8": [
    {
      "q": "The work order says unit 214, but the supplied key opens unit 241. What should you do?",
      "a": [
        "Pause entry and verify the authorized unit with Turnly.",
        "Start in 241 because the key is stronger evidence than the order.",
        "Enter 241 to look for a checklist with the correct number.",
        "Try other nearby doors until you find a vacant unit."
      ],
      "correct": 0,
      "why": "A working key is not confirmation of authorization."
    },
    {
      "q": "An assigned vacant unit contains personal belongings and shows signs of occupancy. What is the next step?",
      "a": [
        "Pause and confirm occupancy and entry instructions before proceeding.",
        "Move the belongings to a closet and begin the turnover.",
        "Begin cleaning only the rooms that look unused.",
        "Assume anything left behind is part of turnover disposal."
      ],
      "correct": 0,
      "why": "An unexpected occupancy condition changes what work and access are authorized."
    },
    {
      "q": "Dry crumbs and grit cover an empty drawer. Which sequence protects the finish?",
      "a": [
        "Remove loose debris, then wipe and check the corners.",
        "Wet-wipe first and vacuum after the residue dries.",
        "Push grit to the rear seam before wiping the center.",
        "Polish the drawer liner before removing debris."
      ],
      "correct": 0,
      "why": "Dry removal avoids dragging grit across the finish."
    },
    {
      "q": "The checklist includes closet shelves. Their front edges look clean. What should you check?",
      "a": [
        "The full reachable shelf, including rear corners and ledges.",
        "Only the front edge because it is visible with the door open.",
        "The door face instead because it is touched more often.",
        "The floor beneath the shelves as proof the shelves were dusted."
      ],
      "correct": 0,
      "why": "Move-in-ready storage includes areas a new resident will use."
    },
    {
      "q": "An oven exterior is assigned but interior service is unclear. What should you do?",
      "a": [
        "Clean the assigned exterior and clarify the interior scope.",
        "Start a self-clean cycle while working elsewhere.",
        "Treat interior work as included because the unit is vacant.",
        "Skip the whole appliance until the interior is authorized."
      ],
      "correct": 0,
      "why": "Vacancy does not automatically expand appliance scope."
    },
    {
      "q": "The refrigerator is empty and interior cleaning is assigned. What best verifies the work?",
      "a": [
        "Inspect cleaned shelves, drawer edges and seals before closeout.",
        "Inspect the handle and confirm the shelves look clear through the door.",
        "Check that no food is left and classify the interior as clean.",
        "Use the absence of odor as the final interior check."
      ],
      "correct": 0,
      "why": "An empty appliance can still contain residue in seams and edges."
    },
    {
      "q": "Paint specks remain on finished flooring. What should guide your response?",
      "a": [
        "Confirm the approved method for the finish and report remaining residue.",
        "Scrape each speck with a blade held flat to the floor.",
        "Use the solvent that worked on painted metal fixtures.",
        "Increase abrasion until the specks lift from the finish."
      ],
      "correct": 0,
      "why": "Turnover detailing must distinguish cleanable soil from a potential damage risk."
    },
    {
      "q": "Fine dust remains along a threshold after the center is vacuumed. What is the best correction?",
      "a": [
        "Detail the threshold with a suitable edge tool and inspect again.",
        "Pass over the center a second time at a slower pace.",
        "Push the dust into the adjoining room for its next service.",
        "Dampen the threshold to make the dust less visible."
      ],
      "correct": 0,
      "why": "Thresholds and corners need direct attention during vacancy cleaning."
    },
    {
      "q": "You find a chipped vanity during final inspection. Which handoff is most useful?",
      "a": [
        "Report the location and observed damage separately from cleaning completion.",
        "Mark the whole bathroom dirty until maintenance repairs the chip.",
        "Polish the chip and leave it out of the handoff if it looks smaller.",
        "List the chip as a missed cleaning item without describing it."
      ],
      "correct": 0,
      "why": "A maintenance issue and a cleaning defect need different follow-up."
    },
    {
      "q": "All rooms look ready from the entrance. What should happen before handoff?",
      "a": [
        "Walk the assigned checklist and verify storage, edges and required evidence.",
        "Submit the entrance view as evidence of the whole unit.",
        "Inspect only the last room because earlier rooms were completed.",
        "Use elapsed time to decide whether the turn is ready."
      ],
      "correct": 0,
      "why": "A final checklist pass catches details the doorway view cannot show."
    }
  ],
  "9": [
    {
      "q": "The entry code fails at an occupied home. What is the best next step?",
      "a": [
        "Use the approved contact channel to verify access instructions.",
        "Try the code from a previous visit before reporting it.",
        "Walk around to look for an unlocked window or door.",
        "Ask a neighbor to let you in through another entrance."
      ],
      "correct": 0,
      "why": "Entry must follow the customer's authorized access process."
    },
    {
      "q": "Customer paperwork is spread across a desk. How do you handle the surface?",
      "a": [
        "Clean accessible areas according to instructions without reading or sorting papers.",
        "Photograph the papers to make replacing them easier.",
        "Stack documents by subject so more desktop is accessible.",
        "Move paperwork into drawers and leave a note about it."
      ],
      "correct": 0,
      "why": "A routine clean does not require exposing or organizing private information."
    },
    {
      "q": "A recurring customer asks for oven restoration during a maintenance clean. What should you do?",
      "a": [
        "Confirm the added scope through Turnly and continue assigned tasks.",
        "Do the oven first and omit routine tasks of similar duration.",
        "Accept if the resident supplies a stronger cleaner.",
        "Add the service to future visits without changing today's work order."
      ],
      "correct": 0,
      "why": "Requested extra work needs scope confirmation rather than a trade of services."
    },
    {
      "q": "A shower has heavy buildup that routine care will not resolve. How should you describe it?",
      "a": [
        "Record the observed buildup and request guidance on deeper service.",
        "Mark it permanently damaged based on its appearance alone.",
        "Repeat routine cleaning indefinitely until the buildup clears.",
        "Promise full restoration at the regular recurring rate."
      ],
      "correct": 0,
      "why": "Describe what is observable and distinguish maintenance from restorative work."
    },
    {
      "q": "A pet is loose and the notes require it to stay behind a gate. What should you do?",
      "a": [
        "Get the agreed pet arrangement restored before working in that area.",
        "Move the pet to a different room on your own.",
        "Prop the gate open until equipment is inside.",
        "Proceed cautiously and assume the pet will avoid wet floors."
      ],
      "correct": 0,
      "why": "Pet instructions protect the animal, resident and contractor."
    },
    {
      "q": "The family asks you to avoid a room during a call. How do you adjust?",
      "a": [
        "Agree on authorized alternatives and clarify whether the room can be serviced later.",
        "Enter briefly because the room appears on the checklist.",
        "Clean silently behind the caller without confirming entry.",
        "Mark the room finished and plan to return without telling anyone."
      ],
      "correct": 0,
      "why": "Temporary restrictions affect routing and what can honestly be marked complete."
    },
    {
      "q": "You serviced this home last week. What should you check before starting today?",
      "a": [
        "Today's assignment notes, access limits and current priorities.",
        "Last week's checklist because the service repeats.",
        "Your usual route before looking at any new customer notes.",
        "The previous completion time as the main guide to scope."
      ],
      "correct": 0,
      "why": "Recurring visits can have updated instructions even at the same address."
    },
    {
      "q": "A recurring preference conflicts with today's written instructions. What should you do?",
      "a": [
        "Clarify the conflict before acting on the disputed task.",
        "Use the older preference because it has been consistent.",
        "Use whichever instruction takes less time.",
        "Combine both methods and let the customer choose afterward."
      ],
      "correct": 0,
      "why": "Resolving conflicting instructions prevents an unauthorized change."
    },
    {
      "q": "A resident points out crumbs left along a counter edge. What is the best response?",
      "a": [
        "Acknowledge the specific miss, correct it within scope and recheck.",
        "Explain your usual method before inspecting the edge.",
        "Offer a discount immediately to settle the concern.",
        "Promise a free deep clean on the next visit."
      ],
      "correct": 0,
      "why": "Specific feedback calls for an appropriate correction and verification."
    },
    {
      "q": "At closeout the resident asks for a guaranteed Friday slot. How should you respond?",
      "a": [
        "Direct scheduling through Turnly and confirm only today's completed work.",
        "Reserve Friday verbally and ask dispatch to honor it later.",
        "Offer a discounted Friday rate if they book immediately.",
        "Promise a time window based on last week's availability."
      ],
      "correct": 0,
      "why": "Contractors should avoid making unauthorized scheduling or pricing commitments."
    }
  ],
  "10": [
    {
      "q": "Two units have the same square footage. One includes appliance interiors. How should you budget time?",
      "a": [
        "Estimate the assigned tasks and condition in each unit separately.",
        "Use identical budgets because floor area is identical.",
        "Divide time by room count without reviewing appliance scope.",
        "Budget both from the shorter of the last two visits."
      ],
      "correct": 0,
      "why": "Scope and condition determine workload beyond square footage."
    },
    {
      "q": "A job has a tight window and a detailed bathroom checklist. How should you plan?",
      "a": [
        "Allocate time to required tasks, transitions and a final check.",
        "Reserve all available time for cleaning and inspect only if early.",
        "Use equal time per room regardless of buildup.",
        "Start the fastest rooms and decide scope when time runs low."
      ],
      "correct": 0,
      "why": "A realistic budget includes inspection and the actual demands of each zone."
    },
    {
      "q": "Which staging choice saves trips without introducing a hazard?",
      "a": [
        "Keep approved supplies together in a safe spot outside travel paths.",
        "Line products along the doorway for quick access.",
        "Leave open bottles at each workstation to save setup time.",
        "Put the cart at the narrowest transition between rooms."
      ],
      "correct": 0,
      "why": "Efficient staging preserves access and safe handling."
    },
    {
      "q": "You repeatedly return to the cart for small tools. What should you change?",
      "a": [
        "Stage the safe tools for the next zone before starting its sequence.",
        "Carry all tools including toilet tools in one open bundle.",
        "Place duplicate supplies in every hallway for the whole visit.",
        "Skip tasks that require a second trip until the final walkthrough."
      ],
      "correct": 0,
      "why": "Plan tool use by zone while maintaining separation and clear paths."
    },
    {
      "q": "You notice unusually heavy kitchen buildup early. What should you do first?",
      "a": [
        "Assess the extra work against scope and communicate the timing impact early.",
        "Save it for last so you can see how much time remains.",
        "Shorten the bathroom disinfection interval to offset the delay.",
        "Drop less visible checklist items to keep the original estimate."
      ],
      "correct": 0,
      "why": "Early recognition gives operations time to respond without sacrificing quality."
    },
    {
      "q": "Why can a vacant turnover and occupied recurring clean require different routes?",
      "a": [
        "Their scopes, access restrictions and resident belongings affect task order.",
        "The vacant unit always needs every appliance interior cleaned.",
        "The occupied home always permits moving furniture to save trips.",
        "The smaller unit should always be completed first."
      ],
      "correct": 0,
      "why": "Plan the route around the actual service and authorized access."
    },
    {
      "q": "A leaking fixture makes the work area unsafe. How should you re-plan?",
      "a": [
        "Stop the affected task, report the hazard and continue only where safe.",
        "Finish that area first so no one else encounters the leak.",
        "Mop nearby while waiting to see if the leak grows.",
        "Reduce the time allowed for the task and work more quickly."
      ],
      "correct": 0,
      "why": "A schedule target does not override an unsafe condition."
    },
    {
      "q": "Halfway through, the remaining authorized work exceeds the time available. What is the best update?",
      "a": [
        "Report what is done, what remains and the expected impact.",
        "Report only that you are running late.",
        "Wait until checkout to list everything that was skipped.",
        "Mark all tasks complete and attach the timing concern separately."
      ],
      "correct": 0,
      "why": "Specific progress lets operations make a timely scope or scheduling decision."
    },
    {
      "q": "When should you check for streaks that commonly appear in each room?",
      "a": [
        "At room closeout and again on the final walkthrough where needed.",
        "Only after all equipment is packed away.",
        "Only if the customer points them out.",
        "During setup before products are applied."
      ],
      "correct": 0,
      "why": "Room checks catch rework while the correct supplies are close by."
    },
    {
      "q": "You finish ahead of budget. What is the best use of the remaining inspection time?",
      "a": [
        "Check assigned details and correct any misses before closing the job.",
        "Add an unapproved service equal in value to the unused time.",
        "End the job immediately because speed confirms efficiency.",
        "Reclean the most visible room without checking other zones."
      ],
      "correct": 0,
      "why": "The time budget is an estimate, while checklist quality determines completion."
    }
  ],
  "11": [
    {
      "q": "Two assignments have similar addresses. What should you verify before accepting?",
      "a": [
        "The property, unit, service category, scope and timing on the actual assignment.",
        "The nearest address and the most recent customer name.",
        "The expected payout and the neighborhood only.",
        "The title in the notification without opening the details."
      ],
      "correct": 0,
      "why": "Similar locations can have different work and documentation requirements."
    },
    {
      "q": "The posted scope differs from what you expected when reviewing a job. What is the best action?",
      "a": [
        "Clarify the discrepancy through Turnly before committing to the work.",
        "Accept first and use the scope from your previous visit.",
        "Treat the shorter scope as the one intended.",
        "Ask another contractor to change the assignment for you."
      ],
      "correct": 0,
      "why": "Acceptance should reflect a clear understanding of the actual assignment."
    },
    {
      "q": "Which status update gives operations the most actionable information?",
      "a": [
        "“Entry code failed at unit 4. I am at the door and need verified access.”",
        "“Something is wrong here. Please call.”",
        "“Customer gave the wrong code again.”",
        "“Work started” while waiting outside for entry."
      ],
      "correct": 0,
      "why": "A useful update identifies the obstacle and needed action without assigning blame."
    },
    {
      "q": "You are still waiting for access. What status should your update communicate?",
      "a": [
        "The actual access delay and which work has yet to begin.",
        "In progress because you arrived within the service window.",
        "Completed because the attempted visit is documented.",
        "On schedule because you expect the door to open shortly."
      ],
      "correct": 0,
      "why": "Status should describe actual work progress so dispatch can respond."
    },
    {
      "q": "Routine completion evidence is required, but a resident's paperwork is visible. What should you do?",
      "a": [
        "Reframe to show the authorized work area while protecting private information.",
        "Capture the full room and rely on the reviewer to ignore the papers.",
        "Move the paperwork to another room without permission.",
        "Substitute a photo from a prior visit to the same room."
      ],
      "correct": 0,
      "why": "Evidence must document this job while staying within authorized spaces."
    },
    {
      "q": "A broken fixture is present before cleaning. Which record best supports review?",
      "a": [
        "A factual issue report with location and authorized evidence of the condition.",
        "A normal after photo without an explanation.",
        "A note guessing who broke the fixture.",
        "A completion note saying the cleaning caused no damage."
      ],
      "correct": 0,
      "why": "Issue reporting documents the observed problem separately from routine QA."
    },
    {
      "q": "A quality flag names the cabinet lip, but your original photo shows only the doors. What should you do?",
      "a": [
        "Inspect the named edge, correct the issue and document that specific area.",
        "Resend the door photo at higher resolution.",
        "Reclean the whole kitchen without checking the flagged edge.",
        "Close the flag because the cabinet doors appear clean."
      ],
      "correct": 0,
      "why": "A targeted flag requires evidence of the actual correction."
    },
    {
      "q": "A customer reports a missed spot after closeout. What should your reply contain?",
      "a": [
        "Acknowledge the location and coordinate the authorized follow-up through Turnly.",
        "Guarantee an off-platform return visit immediately.",
        "Explain why the customer likely overlooked the original cleaning.",
        "Promise a refund before the report is reviewed."
      ],
      "correct": 0,
      "why": "Keep feedback factual and follow the authorized touch-up process."
    },
    {
      "q": "You have two jobs open and are ready to upload evidence. What should you verify?",
      "a": [
        "The assignment ID or unit and that the evidence belongs to that job.",
        "That both jobs are for the same property manager.",
        "That the most recent job appears first in the list.",
        "That the file timestamps fall within today's workday."
      ],
      "correct": 0,
      "why": "Correct media attached to the wrong assignment is still an inaccurate record."
    },
    {
      "q": "The checklist is complete but a required upload failed. How should you close out?",
      "a": [
        "Retry or report the upload issue and verify the required record before completion.",
        "Mark complete and rely on the local file being saved.",
        "Attach the file to any open assignment and message the unit number.",
        "Use an older upload of the same room to satisfy the field."
      ],
      "correct": 0,
      "why": "Closeout includes accurate documentation for the specific assignment."
    }
  ],
  "12": [
    {
      "q": "A trainee passes the written quiz but cannot complete the practical walkthrough. What follows?",
      "a": [
        "Complete the practical requirement and address the demonstrated gaps.",
        "Issue certification because the quiz exceeded the passing score.",
        "Average the quiz with the walkthrough to cancel missing skills.",
        "Grant certification if the trainee can describe the missed steps."
      ],
      "correct": 0,
      "why": "Certification requires demonstrated competency as well as knowledge."
    },
    {
      "q": "A training unit looks clean, but work outside the approved scope caused damage. How should the evaluator assess it?",
      "a": [
        "Evaluate scope and property care alongside visible cleaning quality.",
        "Score only visible cleanliness because it was a cleaning assessment.",
        "Award full credit if the extra work saved time.",
        "Treat the damage as irrelevant when the checklist is complete."
      ],
      "correct": 0,
      "why": "Quality includes respecting scope, safety and property care."
    },
    {
      "q": "In a mock turnover, which check best tests move-in readiness?",
      "a": [
        "Open assigned empty storage and inspect corners, shelves and floor edges.",
        "Stand at the entry and check whether the unit smells fresh.",
        "Check the center of each floor and the front of each cabinet.",
        "Review the completion time before deciding which rooms to inspect."
      ],
      "correct": 0,
      "why": "A new resident uses storage and edges that a doorway inspection misses."
    },
    {
      "q": "A mock vacant kitchen has polished appliance doors but crumbs inside an assigned refrigerator. How should it score?",
      "a": [
        "Record a missed interior task and require correction and reinspection.",
        "Pass the appliance because exterior presentation is strong.",
        "Classify the crumbs as normal wear in a vacant unit.",
        "Accept a promise to clean the refrigerator at the next visit."
      ],
      "correct": 0,
      "why": "Inspect the assigned interior directly rather than inferring it from the exterior."
    },
    {
      "q": "During a residential practical, a restricted bedroom remains untouched. How should the reviewer assess it?",
      "a": [
        "Verify the restriction was honored and assess the authorized areas.",
        "Deduct points automatically because a bedroom was skipped.",
        "Ask the trainee to open the door for a quick visual check.",
        "Give full credit for the entire home based on that decision alone."
      ],
      "correct": 0,
      "why": "Residential inspection includes privacy and adherence to room restrictions."
    },
    {
      "q": "Which observation demonstrates a residential cleaning miss rather than a resident preference?",
      "a": [
        "Removable hair remains on the assigned shower surface.",
        "Personal items remain in their instructed positions.",
        "A restricted closet door remains closed.",
        "A delicate item is untouched under the customer's instructions."
      ],
      "correct": 0,
      "why": "Visible residue on an assigned cleanable surface calls for correction."
    },
    {
      "q": "A trainee scores 88/100 but commits a critical honesty failure. What is the practical outcome?",
      "a": [
        "The trainee does not meet the practical standard.",
        "The trainee passes because the score is above 85.",
        "The trainee passes if the knowledge quiz was perfect.",
        "The trainee passes if the issue occurred during documentation."
      ],
      "correct": 0,
      "why": "The rubric requires both the threshold score and no critical safety or honesty failure."
    },
    {
      "q": "A trainee earns 84/100 with no critical failures. What is the right next step?",
      "a": [
        "Review the missed criteria, practice and reassess against the 85-point target.",
        "Round up because no safety issue occurred.",
        "Replace the missing point with the trainee's best quiz score.",
        "Award the credential and defer review until the first customer job."
      ],
      "correct": 0,
      "why": "Avoiding a critical failure is necessary but does not supply the missing practical points."
    },
    {
      "q": "A contractor completes universal requirements and requests apartment specialization. What still needs verification?",
      "a": [
        "The apartment specialist module and applicable practical checks.",
        "Only that the universal certificate has been issued.",
        "That residential specialization was completed first.",
        "That the contractor has completed any ten Academy modules."
      ],
      "correct": 0,
      "why": "Universal completion does not itself establish a specialist qualification."
    },
    {
      "q": "A trainee repeatedly misses floor edges during practical review. What is the most useful retraining plan?",
      "a": [
        "Practice edge inspection and correction, then demonstrate it on reassessment.",
        "Repeat the entire written quiz without practicing floor inspection.",
        "Increase the speed target to encourage another pass.",
        "Assign a different room type and assume the issue is resolved."
      ],
      "correct": 0,
      "why": "Retraining should target the observed gap and verify improved performance."
    }
  ]
};

function prepareAssessment(module) {
  const bank = academyAssessments[module.number];
  if (!bank) return;
  module.questions = bank.map(question => {
    const options = [...question.a];
    for (let end = options.length - 1; end > 0; end--) {
      const pick = Math.floor(Math.random() * (end + 1));
      [options[end], options[pick]] = [options[pick], options[end]];
    }
    return {...question, a: options, correct: options.indexOf(question.a[question.correct])};
  });
}
